import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import {
  academicSessions,
  branches,
  platformInvoices,
  stayConnectedFees,
  studentSubscriptions,
  tenants,
} from '@saw/db';

import { RequestContextStore } from '../../common/context/request-context';
import { TenantDbService, type Tx } from '../../common/database/tenant-db.service';
import { ApiException } from '../../common/errors/api.exception';
import { StorageService } from '../../common/storage/storage.service';
import { amountInWordsPaise } from './amount-in-words';
import {
  financialYearOf,
  formatInvoiceNumber,
  gstSplitFromExclusive,
  gstSplitFromInclusive,
  INVOICE_SAC_CODE,
  PARENT_SUBSCRIPTION_TOTAL_PAISE,
  STAY_CONNECTED_BASE_PAISE,
} from './billing.constants';
import { gstStateCode, gstStateName } from './gst-states';
import { buildSimplePdf } from './invoice-pdf';
import { SubscriptionsQueueService } from './subscriptions-queue.service';

export type InvoiceKind = 'manual_activations' | 'stay_connected';

type LineItem = {
  description: string;
  quantity: number;
  unitPaise: number;
  amountPaise: number;
};

type Firm = { name: string; gstin: string; address: string; stateCode: string };
type School = { name: string; address: string; stateCode: string };

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    private readonly db: TenantDbService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
    private readonly queue: SubscriptionsQueueService,
  ) {}

  /**
   * B2B invoices only. Play purchases are invoiced by Google, not us.
   * Fails loudly if FIRM_GSTIN is unset — a blank GSTIN on a tax invoice is worse
   * than no invoice.
   *
   * The PDF is enqueued after this transaction commits. Generating it inside
   * the transaction held the shared FY counter row lock across filesystem I/O.
   */
  async generate(tenantId: string, kind: InvoiceKind) {
    const firm = this.requireFirm();
    const now = new Date();
    const fy = financialYearOf(now);

    const issued = await this.db.run(async (tx) => {
      const school = await this.loadSchool(tx, tenantId);
      const intraState = school.stateCode === firm.stateCode;
      const placeOfSupply = `${school.stateCode} — ${gstStateName(school.stateCode)}`;

      let lineItems: LineItem[];
      let split: { basePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number };
      let totalPaise: number;
      let stamp:
        | { kind: 'manual'; ids: string[] }
        | { kind: 'stay_connected'; feeId: string };

      if (kind === 'manual_activations') {
        const [session] = await tx
          .select({ id: academicSessions.id, name: academicSessions.name })
          .from(academicSessions)
          .where(and(eq(academicSessions.tenantId, tenantId), eq(academicSessions.isCurrent, true)))
          .limit(1);
        if (!session) {
          throw new ApiException(422, 'NO_SESSION', 'This school has no current academic session.');
        }

        const unbilled = await tx
          .select({ id: studentSubscriptions.id })
          .from(studentSubscriptions)
          .where(
            and(
              eq(studentSubscriptions.tenantId, tenantId),
              eq(studentSubscriptions.academicSessionId, session.id),
              eq(studentSubscriptions.source, 'manual_cash'),
              isNull(studentSubscriptions.billedToSchoolAt),
            ),
          );

        if (unbilled.length === 0) {
          throw new ApiException(
            422,
            'NOTHING_TO_BILL',
            'There are no unbilled manual activations for this school this session.',
          );
        }

        const quantity = unbilled.length;
        const amountPaise = quantity * PARENT_SUBSCRIPTION_TOTAL_PAISE;
        split = gstSplitFromInclusive(amountPaise, intraState);
        totalPaise = amountPaise;
        lineItems = [
          {
            description: `Parent subscriptions collected in cash — ${session.name} (${quantity} student${quantity === 1 ? '' : 's'})`,
            quantity,
            unitPaise: PARENT_SUBSCRIPTION_TOTAL_PAISE,
            amountPaise,
          },
        ];
        stamp = { kind: 'manual', ids: unbilled.map((r) => r.id) };
      } else {
        const [fee] = await tx
          .select({
            id: stayConnectedFees.id,
            status: stayConnectedFees.status,
            platformInvoiceId: stayConnectedFees.platformInvoiceId,
            academicSessionId: stayConnectedFees.academicSessionId,
          })
          .from(stayConnectedFees)
          .innerJoin(
            academicSessions,
            eq(academicSessions.id, stayConnectedFees.academicSessionId),
          )
          .where(
            and(
              eq(stayConnectedFees.tenantId, tenantId),
              eq(academicSessions.isCurrent, true),
            ),
          )
          .limit(1);

        if (!fee) {
          throw new ApiException(
            422,
            'NOTHING_TO_BILL',
            'No Stay Connected Fee row exists for the current session.',
          );
        }
        if (fee.platformInvoiceId) {
          throw new ApiException(
            409,
            'ALREADY_INVOICED',
            'The Stay Connected Fee for this session has already been invoiced.',
          );
        }

        split = gstSplitFromExclusive(STAY_CONNECTED_BASE_PAISE, intraState);
        totalPaise = split.basePaise + split.cgstPaise + split.sgstPaise + split.igstPaise;
        lineItems = [
          {
            description: 'Stay Connected Fee — annual platform access',
            quantity: 1,
            unitPaise: split.basePaise,
            amountPaise: split.basePaise,
          },
        ];
        stamp = { kind: 'stay_connected', feeId: fee.id };
      }

      const seq = await this.nextSeq(tx, fy);
      const invoiceNumber = formatInvoiceNumber(fy, seq);

      const [invoice] = await tx
        .insert(platformInvoices)
        .values({
          tenantId,
          invoiceNumber,
          financialYear: fy,
          kind,
          lineItems,
          basePaise: split.basePaise,
          cgstPaise: split.cgstPaise,
          sgstPaise: split.sgstPaise,
          igstPaise: split.igstPaise,
          totalPaise,
          sacCode: INVOICE_SAC_CODE,
          placeOfSupply,
          issuedAt: now,
          status: 'issued',
          pdfStatus: 'pending',
          pdfPath: null,
          createdBy: RequestContextStore.peek()?.userId ?? null,
        })
        .returning({
          id: platformInvoices.id,
          invoiceNumber: platformInvoices.invoiceNumber,
        });

      if (stamp.kind === 'manual') {
        await tx
          .update(studentSubscriptions)
          .set({
            billedToSchoolAt: now,
            platformInvoiceId: invoice.id,
            updatedAt: now,
          })
          .where(inArray(studentSubscriptions.id, stamp.ids));
      } else {
        await tx
          .update(stayConnectedFees)
          .set({
            platformInvoiceId: invoice.id,
            invoiceNumber,
            updatedAt: now,
          })
          .where(eq(stayConnectedFees.id, stamp.feeId));
      }

      RequestContextStore.addAudit({
        action: 'platform.invoice.issue',
        entityType: 'platform_invoices',
        entityId: invoice.id,
        changes: {
          invoiceNumber: { from: null, to: invoiceNumber },
          kind: { from: null, to: kind },
          totalPaise: { from: 0, to: totalPaise },
        },
      });

      return {
        id: invoice.id,
        invoiceNumber,
        kind,
        basePaise: split.basePaise,
        cgstPaise: split.cgstPaise,
        sgstPaise: split.sgstPaise,
        igstPaise: split.igstPaise,
        totalPaise,
        placeOfSupply,
        sacCode: INVOICE_SAC_CODE,
      };
    });

    // Do not fall back to inline PDF generation if Redis is down. FeesQueueService
    // does that "so the accountant is not blocked"; copying it here would put
    // filesystem I/O back on the issue request — the exact stall this split
    // removes (shared FY counter lock + disk). The row is already legally
    // issued with a valid number. Leave pdfStatus pending; POST
    // /schools/:id/invoices/:invoiceId/pdf/regenerate recovers it.
    try {
      await this.queue.enqueue({ invoiceId: issued.id, tenantId });
    } catch (err) {
      this.logger.error(
        `Platform invoice ${issued.invoiceNumber} issued but PDF enqueue threw: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }

    return {
      ...issued,
      pdfPath: null,
      pdfStatus: 'pending' as const,
    };
  }

  /**
   * Worker entry: re-read the issued row and write the PDF. Must not run inside
   * generate()'s transaction — that is the whole point of the split.
   */
  async renderQueuedPdf(invoiceId: string, tenantId: string): Promise<void> {
    const firm = this.requireFirm();

    const loaded = await this.db.asTenant(tenantId, async (tx) => {
      const [invoice] = await tx
        .select({
          id: platformInvoices.id,
          tenantId: platformInvoices.tenantId,
          invoiceNumber: platformInvoices.invoiceNumber,
          kind: platformInvoices.kind,
          lineItems: platformInvoices.lineItems,
          basePaise: platformInvoices.basePaise,
          cgstPaise: platformInvoices.cgstPaise,
          sgstPaise: platformInvoices.sgstPaise,
          igstPaise: platformInvoices.igstPaise,
          totalPaise: platformInvoices.totalPaise,
          placeOfSupply: platformInvoices.placeOfSupply,
          issuedAt: platformInvoices.issuedAt,
        })
        .from(platformInvoices)
        .where(
          and(eq(platformInvoices.id, invoiceId), eq(platformInvoices.tenantId, tenantId)),
        )
        .limit(1);
      if (!invoice) {
        throw new ApiException(404, 'NOT_FOUND', 'Invoice not found');
      }
      const school = await this.loadSchool(tx, tenantId);
      return { invoice, school };
    });

    const { invoice, school } = loaded;
    const intraState = school.stateCode === firm.stateCode;
    const pdfPath = `t/${tenantId}/platform-invoices/${invoice.invoiceNumber.replace(/\//g, '-')}.pdf`;
    const pdf = buildSimplePdf(
      this.pdfLines({
        firm,
        school,
        invoiceNumber: invoice.invoiceNumber,
        issuedAt: invoice.issuedAt,
        kind: invoice.kind as InvoiceKind,
        lineItems: invoice.lineItems,
        split: {
          basePaise: invoice.basePaise,
          cgstPaise: invoice.cgstPaise,
          sgstPaise: invoice.sgstPaise,
          igstPaise: invoice.igstPaise,
        },
        totalPaise: invoice.totalPaise,
        placeOfSupply: invoice.placeOfSupply,
        intraState,
      }),
    );

    await this.storage.ensureDirForKey(pdfPath);
    await this.storage.writeBuffer(pdfPath, pdf);

    const now = new Date();
    await this.db.asTenant(tenantId, async (tx) => {
      await tx
        .update(platformInvoices)
        .set({ pdfPath, pdfStatus: 'ready', updatedAt: now })
        .where(eq(platformInvoices.id, invoiceId));
    });
  }

  async markPdfFailed(invoiceId: string, tenantId: string): Promise<void> {
    const now = new Date();
    const number = await this.db.asTenant(tenantId, async (tx) => {
      const [row] = await tx
        .select({ invoiceNumber: platformInvoices.invoiceNumber })
        .from(platformInvoices)
        .where(
          and(eq(platformInvoices.id, invoiceId), eq(platformInvoices.tenantId, tenantId)),
        )
        .limit(1);
      await tx
        .update(platformInvoices)
        .set({ pdfStatus: 'failed', updatedAt: now })
        .where(eq(platformInvoices.id, invoiceId));
      return row?.invoiceNumber ?? invoiceId;
    });
    this.logger.error(
      `Platform invoice PDF failed terminally for ${number} (${invoiceId}). Re-enqueue via POST .../pdf/regenerate.`,
    );
  }

  async getPdf(
    tenantId: string,
    invoiceId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const invoice = await this.loadInvoiceForSchool(tenantId, invoiceId);
    if (invoice.pdfStatus === 'pending') {
      throw new ApiException(
        409,
        'INVOICE_PDF_PENDING',
        'This invoice PDF is still being generated. Retry shortly, or use regenerate if it has been pending too long.',
      );
    }
    if (invoice.pdfStatus === 'failed') {
      throw new ApiException(
        409,
        'INVOICE_PDF_FAILED',
        'This invoice PDF failed to generate. Use regenerate to retry.',
      );
    }
    if (!invoice.pdfPath || !(await this.storage.exists(invoice.pdfPath))) {
      throw new ApiException(404, 'NOT_FOUND', 'Invoice PDF not found');
    }
    const buffer = await this.storage.readBuffer(invoice.pdfPath);
    return {
      buffer,
      filename: `${invoice.invoiceNumber.replace(/\//g, '-')}.pdf`,
    };
  }

  async regeneratePdf(
    tenantId: string,
    invoiceId: string,
  ): Promise<{ invoiceId: string; jobId: string; queued: boolean; pdfStatus: 'pending' }> {
    await this.loadInvoiceForSchool(tenantId, invoiceId);
    const now = new Date();
    await this.db.run(async (tx) => {
      await tx
        .update(platformInvoices)
        .set({ pdfStatus: 'pending', updatedAt: now })
        .where(and(eq(platformInvoices.id, invoiceId), eq(platformInvoices.tenantId, tenantId)));
    });
    let queued = false;
    let jobId = this.queue.jobId(invoiceId);
    try {
      const result = await this.queue.reenqueue({ invoiceId, tenantId });
      queued = result.queued;
      jobId = result.jobId;
    } catch (err) {
      this.logger.error(
        `PDF regenerate enqueue threw for ${invoiceId}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
    return { invoiceId, jobId, queued, pdfStatus: 'pending' };
  }

  /** Collision-safe FY sequence. INSERT … ON CONFLICT UPDATE is the row lock. */
  async nextSeq(tx: Tx, financialYear: string): Promise<number> {
    const result = await tx.execute(sql`
      INSERT INTO platform_invoice_counters (financial_year, last_number)
      VALUES (${financialYear}, 1)
      ON CONFLICT (financial_year)
      DO UPDATE SET last_number = platform_invoice_counters.last_number + 1
      RETURNING last_number
    `);
    const rows = result as unknown as Array<{ last_number: number | string }>;
    const nested = (result as unknown as { rows?: Array<{ last_number: number | string }> }).rows;
    const n = rows[0]?.last_number ?? nested?.[0]?.last_number;
    if (n == null) {
      throw new ApiException(500, 'INVOICE_NUMBER_FAILED', 'Could not allocate an invoice number.');
    }
    return Number(n);
  }

  /**
   * School name, address, GST split, student *count*. Never a student or parent
   * name — this is a B2B tax invoice and the aggregate-only rule still holds
   * when the PDF is exposed on a download route.
   */
  pdfLines(input: {
    firm: Firm;
    school: School;
    invoiceNumber: string;
    issuedAt: Date;
    kind: InvoiceKind;
    lineItems: LineItem[];
    split: { basePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number };
    totalPaise: number;
    placeOfSupply: string;
    intraState: boolean;
  }): string[] {
    const rupee = (p: number) => `INR ${(p / 100).toFixed(2)}`;
    const lines = [
      'TAX INVOICE',
      `${input.firm.name}`,
      `GSTIN: ${input.firm.gstin}`,
      input.firm.address,
      `State code: ${input.firm.stateCode}`,
      '',
      `Invoice no: ${input.invoiceNumber}`,
      `Date: ${input.issuedAt.toISOString().slice(0, 10)}`,
      `SAC: ${INVOICE_SAC_CODE} — Hosting and IT infrastructure provisioning services`,
      '',
      `Bill to: ${input.school.name}`,
      input.school.address,
      `Place of supply: ${input.placeOfSupply}`,
      '',
      'Line items',
    ];
    for (const item of input.lineItems) {
      lines.push(
        `${item.description}  qty ${item.quantity}  @ ${rupee(item.unitPaise)}  = ${rupee(item.amountPaise)}`,
      );
    }
    lines.push('');
    lines.push(`Taxable value: ${rupee(input.split.basePaise)}`);
    if (input.intraState) {
      lines.push(`CGST 9%: ${rupee(input.split.cgstPaise)}`);
      lines.push(`SGST 9%: ${rupee(input.split.sgstPaise)}`);
    } else {
      lines.push(`IGST 18%: ${rupee(input.split.igstPaise)}`);
    }
    lines.push(`Total: ${rupee(input.totalPaise)}`);
    lines.push(`Amount in words: ${amountInWordsPaise(input.totalPaise)}`);
    lines.push('');
    lines.push('This invoice is issued for B2B supply to the school. Subject to CA review.');
    return lines;
  }

  private async loadInvoiceForSchool(tenantId: string, invoiceId: string) {
    const [invoice] = await this.db.run(async (tx) =>
      tx
        .select({
          id: platformInvoices.id,
          tenantId: platformInvoices.tenantId,
          invoiceNumber: platformInvoices.invoiceNumber,
          pdfPath: platformInvoices.pdfPath,
          pdfStatus: platformInvoices.pdfStatus,
        })
        .from(platformInvoices)
        .where(eq(platformInvoices.id, invoiceId))
        .limit(1),
    );
    if (!invoice || invoice.tenantId !== tenantId) {
      throw new ApiException(404, 'NOT_FOUND', 'Invoice not found');
    }
    return invoice;
  }

  private requireFirm(): Firm {
    const name = this.config.get<string>('FIRM_NAME')?.trim();
    const gstin = this.config.get<string>('FIRM_GSTIN')?.trim();
    const address = this.config.get<string>('FIRM_ADDRESS')?.trim();
    const stateCode = this.config.get<string>('FIRM_STATE_CODE')?.trim();
    if (!gstin) {
      throw new ApiException(
        422,
        'FIRM_GSTIN_MISSING',
        'Cannot issue a tax invoice: FIRM_GSTIN is not configured. Set the GSTIN in the API environment and retry.',
      );
    }
    if (!name || !address || !stateCode) {
      throw new ApiException(
        422,
        'FIRM_IDENTITY_INCOMPLETE',
        'Cannot issue a tax invoice: FIRM_NAME, FIRM_ADDRESS and FIRM_STATE_CODE must all be set.',
      );
    }
    const code = gstStateCode(stateCode);
    if (!code) {
      throw new ApiException(
        422,
        'FIRM_STATE_INVALID',
        `FIRM_STATE_CODE '${stateCode}' is not a valid Indian GST state code.`,
      );
    }
    return { name, gstin, address, stateCode: code };
  }

  private async loadSchool(tx: Tx, tenantId: string): Promise<School> {
    const [tenant] = await tx
      .select({
        name: tenants.name,
        legalName: tenants.legalName,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (!tenant) throw new ApiException(404, 'NOT_FOUND', 'School not found');

    const [branch] = await tx
      .select({
        state: branches.state,
        city: branches.city,
        addressLine1: branches.addressLine1,
        pincode: branches.pincode,
      })
      .from(branches)
      .where(eq(branches.tenantId, tenantId))
      .orderBy(branches.code)
      .limit(1);

    const stateCode = gstStateCode(branch?.state ?? null);
    if (!stateCode) {
      throw new ApiException(
        422,
        'PLACE_OF_SUPPLY_UNKNOWN',
        `Cannot determine GST place of supply from school state '${branch?.state ?? ''}'. Set a valid Indian state on the branch and retry.`,
      );
    }

    return {
      name: tenant.legalName || tenant.name,
      address: [branch?.addressLine1, branch?.city, branch?.pincode].filter(Boolean).join(', '),
      stateCode,
    };
  }
}

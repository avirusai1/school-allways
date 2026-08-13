import { createHmac, timingSafeEqual } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type Redis from 'ioredis';

import {
  daybookEntries,
  feeHeads,
  feeReminders,
  feeStructureItems,
  feeStructures,
  invoiceLines,
  invoices,
  paymentAllocations,
  payments,
  settlements,
  studentConcessions,
  studentEnrollments,
  students,
} from '@saw/db';

import {
  RequestContextStore,
  type GrantedPermission,
} from '../../common/context/request-context';
import { TenantDbService, type Tx } from '../../common/database/tenant-db.service';
import { ApiException } from '../../common/errors/api.exception';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import { assertInScope, scopeFilter } from '../../common/rbac/scope.util';
import { stackConcessions } from './concession-stack';
import { nextInvoiceNo, nextReceiptNo } from './document-numbers';
import type {
  ApproveStructureDto,
  CloseDaybookDto,
  CollectPaymentDto,
  CreateConcessionDto,
  CreateFeeHeadDto,
  CreateFeeStructureDto,
  DefaultersQuery,
  GenerateInvoicesDto,
  GatewayWebhookDto,
  ImportSettlementsDto,
  InitiateOnlinePaymentDto,
  MatchSettlementDto,
  PatchFeeHeadDto,
  PromiseToPayDto,
  RefundPaymentDto,
  RemindDefaultersDto,
} from './dto/fees.dto';
import {
  toFeeInvoiceDto,
  toFeeStatusDto,
  type FeeInvoiceDto,
  type FeeStatusDto,
} from './fee-dtos';
import { FeesQueueService } from './fees-queue.service';

const HIKE_JUSTIFICATION_THRESHOLD_BP = 500; // 5%
const OUTSTANDING_STATUSES = ['issued', 'partially_paid', 'overdue'] as const;
const ORDER_REDIS_TTL_SEC = 60 * 60 * 24 * 7;

@Injectable()
export class FeesService {
  private readonly logger = new Logger(FeesService.name);

  constructor(
    private readonly db: TenantDbService,
    private readonly queue: FeesQueueService,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // ---------------------------------------------------------------------------
  // Heads
  // ---------------------------------------------------------------------------

  async listHeads() {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) =>
      tx
        .select({
          id: feeHeads.id,
          code: feeHeads.code,
          name: feeHeads.name,
          category: feeHeads.category,
          isOptional: feeHeads.isOptional,
          isRefundable: feeHeads.isRefundable,
          allowsConcession: feeHeads.allowsConcession,
          ledgerCode: feeHeads.ledgerCode,
          sequence: feeHeads.sequence,
          isActive: feeHeads.isActive,
        })
        .from(feeHeads)
        .where(and(eq(feeHeads.branchId, ctx.branchId!), eq(feeHeads.isActive, true)))
        .orderBy(feeHeads.sequence, feeHeads.name),
    );
  }

  async createHead(dto: CreateFeeHeadDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [row] = await tx
        .insert(feeHeads)
        .values({
          tenantId: ctx.tenantId!,
          branchId: ctx.branchId!,
          code: dto.code,
          name: dto.name,
          category: dto.category ?? 'tuition',
          isOptional: dto.isOptional ?? false,
          isRefundable: dto.isRefundable ?? false,
          allowsConcession: dto.allowsConcession ?? true,
          ledgerCode: dto.ledgerCode,
          sequence: dto.sequence ?? 0,
        })
        .returning({
          id: feeHeads.id,
          code: feeHeads.code,
          name: feeHeads.name,
        });
      return row;
    });
  }

  async patchHead(id: string, dto: PatchFeeHeadDto) {
    return this.db.run(async (tx) => {
      const [row] = await tx
        .update(feeHeads)
        .set({
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.category !== undefined ? { category: dto.category } : {}),
          ...(dto.isOptional !== undefined ? { isOptional: dto.isOptional } : {}),
          ...(dto.isRefundable !== undefined ? { isRefundable: dto.isRefundable } : {}),
          ...(dto.allowsConcession !== undefined
            ? { allowsConcession: dto.allowsConcession }
            : {}),
          ...(dto.ledgerCode !== undefined ? { ledgerCode: dto.ledgerCode } : {}),
          ...(dto.sequence !== undefined ? { sequence: dto.sequence } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          updatedAt: new Date(),
        })
        .where(eq(feeHeads.id, id))
        .returning({ id: feeHeads.id, name: feeHeads.name });
      if (!row) throw new ApiException(404, 'NOT_FOUND', 'Fee head not found');
      return row;
    });
  }

  // ---------------------------------------------------------------------------
  // Structures
  // ---------------------------------------------------------------------------

  async listStructures(academicSessionId?: string) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const rows = await tx
        .select({
          id: feeStructures.id,
          name: feeStructures.name,
          version: feeStructures.version,
          classId: feeStructures.classId,
          academicSessionId: feeStructures.academicSessionId,
          effectiveFrom: feeStructures.effectiveFrom,
          effectiveTo: feeStructures.effectiveTo,
          status: feeStructures.status,
          hikeOverPreviousBp: feeStructures.hikeOverPreviousBp,
          hikeJustification: feeStructures.hikeJustification,
        })
        .from(feeStructures)
        .where(
          and(
            eq(feeStructures.branchId, ctx.branchId!),
            academicSessionId
              ? eq(feeStructures.academicSessionId, academicSessionId)
              : undefined,
          ),
        )
        .orderBy(desc(feeStructures.version));
      return rows;
    });
  }

  async createStructure(dto: CreateFeeStructureDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const prev = await tx
        .select({
          id: feeStructures.id,
          version: feeStructures.version,
        })
        .from(feeStructures)
        .where(
          and(
            eq(feeStructures.branchId, ctx.branchId!),
            eq(feeStructures.academicSessionId, dto.academicSessionId),
            dto.classId
              ? eq(feeStructures.classId, dto.classId)
              : isNull(feeStructures.classId),
          ),
        )
        .orderBy(desc(feeStructures.version))
        .limit(1);

      const version = (prev[0]?.version ?? 0) + 1;
      let hikeOverPreviousBp: number | null = null;

      if (prev[0]) {
        const prevTotal = await this.structureGrossTotal(tx, prev[0].id);
        const newTotal = dto.items.reduce((s, i) => s + i.amountPaise, 0);
        if (prevTotal > 0 && newTotal > prevTotal) {
          hikeOverPreviousBp = Math.floor(((newTotal - prevTotal) * 10_000) / prevTotal);
        }
      }

      if (
        hikeOverPreviousBp != null &&
        hikeOverPreviousBp > HIKE_JUSTIFICATION_THRESHOLD_BP &&
        !dto.hikeJustification
      ) {
        throw new ApiException(
          422,
          'HIKE_JUSTIFICATION_REQUIRED',
          `This structure is a ${(hikeOverPreviousBp / 100).toFixed(1)}% hike over the previous version. Provide hikeJustification.`,
          { hikeOverPreviousBp, thresholdBp: HIKE_JUSTIFICATION_THRESHOLD_BP },
        );
      }

      const [structure] = await tx
        .insert(feeStructures)
        .values({
          tenantId: ctx.tenantId!,
          branchId: ctx.branchId!,
          academicSessionId: dto.academicSessionId,
          classId: dto.classId,
          name: dto.name,
          version,
          effectiveFrom: dto.effectiveFrom,
          effectiveTo: dto.effectiveTo,
          status: 'draft',
          hikeOverPreviousBp,
          hikeJustification: dto.hikeJustification,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({
          id: feeStructures.id,
          version: feeStructures.version,
          hikeOverPreviousBp: feeStructures.hikeOverPreviousBp,
        });

      await tx.insert(feeStructureItems).values(
        dto.items.map((item) => ({
          tenantId: ctx.tenantId!,
          feeStructureId: structure!.id,
          feeHeadId: item.feeHeadId,
          termId: item.termId,
          amountPaise: item.amountPaise,
          frequency: item.frequency ?? 'term',
          dueDate: item.dueDate,
          lateFeePerDayPaise: item.lateFeePerDayPaise ?? 0,
          lateFeeMaxPaise: item.lateFeeMaxPaise,
          graceDays: item.graceDays ?? 0,
        })),
      );

      RequestContextStore.addAudit({
        action: 'fee.structure.create',
        entityType: 'fee_structure',
        entityId: structure!.id,
      });

      return structure;
    });
  }

  async approveStructure(id: string, dto: ApproveStructureDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [row] = await tx
        .select({
          id: feeStructures.id,
          status: feeStructures.status,
          hikeOverPreviousBp: feeStructures.hikeOverPreviousBp,
          hikeJustification: feeStructures.hikeJustification,
        })
        .from(feeStructures)
        .where(eq(feeStructures.id, id))
        .limit(1);

      if (!row) throw new ApiException(404, 'NOT_FOUND', 'Fee structure not found');
      if (row.status === 'approved') {
        throw new ApiException(409, 'ALREADY_APPROVED', 'This structure is already approved.');
      }

      const justification = dto.hikeJustification ?? row.hikeJustification;
      if (
        row.hikeOverPreviousBp != null &&
        row.hikeOverPreviousBp > HIKE_JUSTIFICATION_THRESHOLD_BP &&
        !justification
      ) {
        throw new ApiException(
          422,
          'HIKE_JUSTIFICATION_REQUIRED',
          'Approving a hike above the threshold requires hikeJustification.',
          { hikeOverPreviousBp: row.hikeOverPreviousBp },
        );
      }

      const [updated] = await tx
        .update(feeStructures)
        .set({
          status: 'approved',
          approvedByUserId: ctx.userId,
          approvedAt: new Date(),
          hikeJustification: justification,
          approvalDocumentPath: dto.approvalDocumentPath,
          updatedAt: new Date(),
          updatedBy: ctx.userId,
        })
        .where(eq(feeStructures.id, id))
        .returning({
          id: feeStructures.id,
          status: feeStructures.status,
          hikeOverPreviousBp: feeStructures.hikeOverPreviousBp,
          hikeJustification: feeStructures.hikeJustification,
          approvedAt: feeStructures.approvedAt,
        });

      RequestContextStore.addAudit({
        action: 'fee.structure.approve',
        entityType: 'fee_structure',
        entityId: id,
        changes: {
          status: { from: row.status, to: 'approved' },
          hikeOverPreviousBp: {
            from: null,
            to: updated?.hikeOverPreviousBp ?? null,
          },
        },
      });

      return updated;
    });
  }

  async previewStructure(structureId: string, classId: string, studentId?: string) {
    return this.db.run(async (tx) => {
      const [structure] = await tx
        .select({
          id: feeStructures.id,
          name: feeStructures.name,
          academicSessionId: feeStructures.academicSessionId,
          status: feeStructures.status,
        })
        .from(feeStructures)
        .where(eq(feeStructures.id, structureId))
        .limit(1);
      if (!structure) throw new ApiException(404, 'NOT_FOUND', 'Fee structure not found');

      const items = await tx
        .select({
          feeHeadId: feeStructureItems.feeHeadId,
          termId: feeStructureItems.termId,
          amountPaise: feeStructureItems.amountPaise,
          dueDate: feeStructureItems.dueDate,
          headName: feeHeads.name,
          allowsConcession: feeHeads.allowsConcession,
        })
        .from(feeStructureItems)
        .innerJoin(feeHeads, eq(feeHeads.id, feeStructureItems.feeHeadId))
        .where(eq(feeStructureItems.feeStructureId, structureId));

      let concessions: Array<{
        id: string;
        feeHeadId: string | null;
        percentageBp: number | null;
        flatAmountPaise: number | null;
      }> = [];

      if (studentId) {
        concessions = await tx
          .select({
            id: studentConcessions.id,
            feeHeadId: studentConcessions.feeHeadId,
            percentageBp: studentConcessions.percentageBp,
            flatAmountPaise: studentConcessions.flatAmountPaise,
          })
          .from(studentConcessions)
          .where(
            and(
              eq(studentConcessions.studentId, studentId),
              eq(studentConcessions.academicSessionId, structure.academicSessionId),
              eq(studentConcessions.status, 'approved'),
            ),
          );
      }

      const lines = items.map((item) => {
        const stacked = stackConcessions(
          item.amountPaise,
          concessions,
          item.feeHeadId,
          item.allowsConcession,
        );
        return {
          feeHeadId: item.feeHeadId,
          headName: item.headName,
          termId: item.termId,
          grossAmountPaise: item.amountPaise,
          concessionAmountPaise: stacked.concessionAmountPaise,
          netAmountPaise: stacked.netAmountPaise,
          appliedConcessionIds: stacked.appliedConcessionIds,
          dueDate: item.dueDate,
        };
      });

      return {
        structureId,
        classId,
        studentId: studentId ?? null,
        lines,
        grossTotalPaise: lines.reduce((s, l) => s + l.grossAmountPaise, 0),
        netTotalPaise: lines.reduce((s, l) => s + l.netAmountPaise, 0),
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Concessions
  // ---------------------------------------------------------------------------

  async listConcessions(studentId?: string, academicSessionId?: string) {
    return this.db.run(async (tx) =>
      tx
        .select({
          id: studentConcessions.id,
          studentId: studentConcessions.studentId,
          academicSessionId: studentConcessions.academicSessionId,
          type: studentConcessions.type,
          feeHeadId: studentConcessions.feeHeadId,
          percentageBp: studentConcessions.percentageBp,
          flatAmountPaise: studentConcessions.flatAmountPaise,
          reason: studentConcessions.reason,
          status: studentConcessions.status,
          validFrom: studentConcessions.validFrom,
          validTo: studentConcessions.validTo,
        })
        .from(studentConcessions)
        .where(
          and(
            studentId ? eq(studentConcessions.studentId, studentId) : undefined,
            academicSessionId
              ? eq(studentConcessions.academicSessionId, academicSessionId)
              : undefined,
          ),
        )
        .orderBy(desc(studentConcessions.createdAt))
        .limit(200),
    );
  }

  async createConcession(dto: CreateConcessionDto) {
    const ctx = RequestContextStore.get();
    if (
      (dto.percentageBp == null && dto.flatAmountPaise == null) ||
      (dto.percentageBp != null && dto.flatAmountPaise != null)
    ) {
      throw new ApiException(
        400,
        'VALIDATION_ERROR',
        'Provide exactly one of percentageBp or flatAmountPaise.',
      );
    }

    return this.db.run(async (tx) => {
      const [row] = await tx
        .insert(studentConcessions)
        .values({
          tenantId: ctx.tenantId!,
          studentId: dto.studentId,
          academicSessionId: dto.academicSessionId,
          type: dto.type,
          feeHeadId: dto.feeHeadId,
          percentageBp: dto.percentageBp,
          flatAmountPaise: dto.flatAmountPaise,
          reason: dto.reason,
          documentPath: dto.documentPath,
          status: 'pending',
          validFrom: dto.validFrom,
          validTo: dto.validTo,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({
          id: studentConcessions.id,
          type: studentConcessions.type,
          status: studentConcessions.status,
        });
      return row;
    });
  }

  async approveConcession(id: string) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [updated] = await tx
        .update(studentConcessions)
        .set({
          status: 'approved',
          approvedByUserId: ctx.userId,
          approvedAt: new Date(),
          updatedAt: new Date(),
          updatedBy: ctx.userId,
        })
        .where(eq(studentConcessions.id, id))
        .returning({
          id: studentConcessions.id,
          status: studentConcessions.status,
          approvedAt: studentConcessions.approvedAt,
        });
      if (!updated) throw new ApiException(404, 'NOT_FOUND', 'Concession not found');
      return updated;
    });
  }

  // ---------------------------------------------------------------------------
  // Invoice generation
  // ---------------------------------------------------------------------------

  async generateInvoices(dto: GenerateInvoicesDto) {
    const ctx = RequestContextStore.get();
    if (!ctx.branchId || !ctx.tenantId) {
      throw new ApiException(400, 'BAD_REQUEST', 'branchId is required');
    }

    const estimatedCount = await this.db.run(async (tx) => {
      const rows = await tx
        .select({ studentId: studentEnrollments.studentId })
        .from(studentEnrollments)
        .where(
          and(
            eq(studentEnrollments.academicSessionId, dto.academicSessionId),
            eq(studentEnrollments.branchId, ctx.branchId!),
            inArray(studentEnrollments.classId, dto.classIds),
            inArray(studentEnrollments.status, ['active', 'admitted', 'on_leave']),
          ),
        );
      return rows.length;
    });

    if (dto.dryRun) {
      return { dryRun: true, estimatedCount, jobIds: [] as string[] };
    }

    const jobIds: string[] = [];
    const inlineFailed: string[] = [];

    for (const classId of dto.classIds) {
      const enqueued = await this.queue.enqueue({
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        userId: ctx.userId,
        academicSessionId: dto.academicSessionId,
        termId: dto.termId,
        classId,
        issueDate: dto.issueDate,
      });
      jobIds.push(enqueued.jobId);

      if (!enqueued.queued) {
        // Redis down — generate inline so the accountant is not blocked.
        try {
          await this.generateForClass({
            tenantId: ctx.tenantId,
            branchId: ctx.branchId,
            userId: ctx.userId,
            academicSessionId: dto.academicSessionId,
            termId: dto.termId,
            classId,
            issueDate: dto.issueDate,
          });
        } catch (err) {
          this.logger.error(err);
          inlineFailed.push(classId);
        }
      }
    }

    return {
      jobId: jobIds[0],
      jobIds,
      estimatedCount,
      inlineFailed,
    };
  }

  /**
   * Generate invoices for one class. Idempotent: skips students who already
   * have an invoice for this session+term.
   */
  async generateForClass(job: {
    tenantId: string;
    branchId: string;
    userId: string | null;
    academicSessionId: string;
    termId: string;
    classId: string;
    issueDate: string;
  }): Promise<{ created: number; skipped: number }> {
    return this.db.run(async (tx) => {
      const [structure] = await tx
        .select({
          id: feeStructures.id,
        })
        .from(feeStructures)
        .where(
          and(
            eq(feeStructures.branchId, job.branchId),
            eq(feeStructures.academicSessionId, job.academicSessionId),
            eq(feeStructures.classId, job.classId),
            eq(feeStructures.status, 'approved'),
          ),
        )
        .orderBy(desc(feeStructures.version))
        .limit(1);

      if (!structure) {
        throw new ApiException(
          422,
          'NO_APPROVED_STRUCTURE',
          'No approved fee structure for this class and session.',
          { classId: job.classId },
        );
      }

      const items = await tx
        .select({
          feeHeadId: feeStructureItems.feeHeadId,
          termId: feeStructureItems.termId,
          amountPaise: feeStructureItems.amountPaise,
          dueDate: feeStructureItems.dueDate,
          headName: feeHeads.name,
          allowsConcession: feeHeads.allowsConcession,
        })
        .from(feeStructureItems)
        .innerJoin(feeHeads, eq(feeHeads.id, feeStructureItems.feeHeadId))
        .where(
          and(
            eq(feeStructureItems.feeStructureId, structure.id),
            eq(feeStructureItems.termId, job.termId),
          ),
        );

      if (items.length === 0) {
        return { created: 0, skipped: 0 };
      }

      const enrollments = await tx
        .select({
          studentId: studentEnrollments.studentId,
        })
        .from(studentEnrollments)
        .where(
          and(
            eq(studentEnrollments.academicSessionId, job.academicSessionId),
            eq(studentEnrollments.classId, job.classId),
            eq(studentEnrollments.branchId, job.branchId),
            inArray(studentEnrollments.status, ['active', 'admitted', 'on_leave']),
          ),
        );

      const existing = await tx
        .select({ studentId: invoices.studentId })
        .from(invoices)
        .where(
          and(
            eq(invoices.academicSessionId, job.academicSessionId),
            eq(invoices.termId, job.termId),
            eq(invoices.branchId, job.branchId),
            inArray(
              invoices.studentId,
              enrollments.map((e) => e.studentId),
            ),
            sql`${invoices.status} <> 'cancelled'`,
          ),
        );
      const already = new Set(existing.map((e) => e.studentId));

      const concessions = await tx
        .select({
          id: studentConcessions.id,
          studentId: studentConcessions.studentId,
          feeHeadId: studentConcessions.feeHeadId,
          percentageBp: studentConcessions.percentageBp,
          flatAmountPaise: studentConcessions.flatAmountPaise,
        })
        .from(studentConcessions)
        .where(
          and(
            eq(studentConcessions.academicSessionId, job.academicSessionId),
            eq(studentConcessions.status, 'approved'),
            inArray(
              studentConcessions.studentId,
              enrollments.map((e) => e.studentId),
            ),
          ),
        );

      const concessionsByStudent = new Map<string, typeof concessions>();
      for (const c of concessions) {
        const list = concessionsByStudent.get(c.studentId) ?? [];
        list.push(c);
        concessionsByStudent.set(c.studentId, list);
      }

      let created = 0;
      let skipped = 0;
      const defaultDue =
        items.map((i) => i.dueDate).filter(Boolean).sort()[0] ?? job.issueDate;

      // Chunk 500
      for (let i = 0; i < enrollments.length; i += 500) {
        const chunk = enrollments.slice(i, i + 500);
        for (const enr of chunk) {
          if (already.has(enr.studentId)) {
            skipped += 1;
            continue;
          }

          const studentCons = concessionsByStudent.get(enr.studentId) ?? [];
          const lines = items.map((item, seq) => {
            const stacked = stackConcessions(
              item.amountPaise,
              studentCons,
              item.feeHeadId,
              item.allowsConcession,
            );
            return {
              feeHeadId: item.feeHeadId,
              description: item.headName,
              grossAmountPaise: item.amountPaise,
              concessionAmountPaise: stacked.concessionAmountPaise,
              netAmountPaise: stacked.netAmountPaise,
              appliedConcessionIds: stacked.appliedConcessionIds,
              sequence: seq,
            };
          });

          const gross = lines.reduce((s, l) => s + l.grossAmountPaise, 0);
          const concession = lines.reduce((s, l) => s + l.concessionAmountPaise, 0);
          const net = lines.reduce((s, l) => s + l.netAmountPaise, 0);
          const invoiceNo = await nextInvoiceNo(tx, job.branchId, job.academicSessionId);

          const [inv] = await tx
            .insert(invoices)
            .values({
              tenantId: job.tenantId,
              branchId: job.branchId,
              studentId: enr.studentId,
              academicSessionId: job.academicSessionId,
              termId: job.termId,
              invoiceNo,
              issueDate: job.issueDate,
              dueDate: defaultDue!,
              grossAmountPaise: gross,
              concessionAmountPaise: concession,
              lateFeePaise: 0,
              adjustmentPaise: 0,
              netAmountPaise: net,
              paidAmountPaise: 0,
              balancePaise: net,
              status: 'issued',
              ageingBucket: 0,
              createdBy: job.userId,
              updatedBy: job.userId,
            })
            .returning({ id: invoices.id });

          await tx.insert(invoiceLines).values(
            lines.map((l) => ({
              tenantId: job.tenantId,
              invoiceId: inv!.id,
              feeHeadId: l.feeHeadId,
              description: l.description,
              grossAmountPaise: l.grossAmountPaise,
              concessionAmountPaise: l.concessionAmountPaise,
              netAmountPaise: l.netAmountPaise,
              paidAmountPaise: 0,
              appliedConcessionIds: l.appliedConcessionIds,
              sequence: l.sequence,
            })),
          );
          created += 1;
        }
      }

      return { created, skipped };
    });
  }

  // ---------------------------------------------------------------------------
  // Two DTOs — separate methods
  // ---------------------------------------------------------------------------

  async getFeeStatus(
    studentId: string,
    grant: GrantedPermission,
    academicSessionId?: string,
  ): Promise<FeeStatusDto[]> {
    assertInScope(grant, { studentId });
    const ctx = RequestContextStore.get();

    return this.db.run(async (tx) => {
      const rows = await tx
        .select({
          studentId: invoices.studentId,
          status: invoices.status,
          balancePaise: invoices.balancePaise,
          ageingBucket: invoices.ageingBucket,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.studentId, studentId),
            eq(invoices.branchId, ctx.branchId!),
            inArray(invoices.status, [...OUTSTANDING_STATUSES]),
            academicSessionId
              ? eq(invoices.academicSessionId, academicSessionId)
              : undefined,
          ),
        );

      // Aggregate outstanding into one status row per student (teachers need nudge info).
      if (rows.length === 0) {
        return [
          toFeeStatusDto({
            studentId,
            status: 'paid',
            balancePaise: 0,
            ageingBucket: 0,
          }),
        ];
      }

      const amountDuePaise = rows.reduce((s, r) => s + r.balancePaise, 0);
      const ageingBucket = Math.max(...rows.map((r) => r.ageingBucket ?? 0));
      const status = rows.some((r) => r.status === 'overdue')
        ? 'overdue'
        : rows.some((r) => r.status === 'partially_paid')
          ? 'partially_paid'
          : 'issued';

      return [toFeeStatusDto({ studentId, status, balancePaise: amountDuePaise, ageingBucket })];
    });
  }

  async getFeeInvoice(
    invoiceId: string,
    grant: GrantedPermission,
  ): Promise<FeeInvoiceDto> {
    return this.db.run(async (tx) => {
      const [inv] = await tx
        .select({
          id: invoices.id,
          studentId: invoices.studentId,
          invoiceNo: invoices.invoiceNo,
          issueDate: invoices.issueDate,
          dueDate: invoices.dueDate,
          status: invoices.status,
          grossAmountPaise: invoices.grossAmountPaise,
          concessionAmountPaise: invoices.concessionAmountPaise,
          lateFeePaise: invoices.lateFeePaise,
          netAmountPaise: invoices.netAmountPaise,
          paidAmountPaise: invoices.paidAmountPaise,
          balancePaise: invoices.balancePaise,
          ageingBucket: invoices.ageingBucket,
        })
        .from(invoices)
        .where(eq(invoices.id, invoiceId))
        .limit(1);

      if (!inv) throw new ApiException(404, 'NOT_FOUND', 'Invoice not found');
      assertInScope(grant, { studentId: inv.studentId });

      const lines = await tx
        .select({
          id: invoiceLines.id,
          feeHeadId: invoiceLines.feeHeadId,
          description: invoiceLines.description,
          grossAmountPaise: invoiceLines.grossAmountPaise,
          concessionAmountPaise: invoiceLines.concessionAmountPaise,
          netAmountPaise: invoiceLines.netAmountPaise,
          paidAmountPaise: invoiceLines.paidAmountPaise,
          appliedConcessionIds: invoiceLines.appliedConcessionIds,
        })
        .from(invoiceLines)
        .where(eq(invoiceLines.invoiceId, invoiceId));

      const paymentRows = await tx
        .select({
          id: payments.id,
          receiptNo: payments.receiptNo,
          paymentDate: payments.paymentDate,
          amountPaise: payments.amountPaise,
          mode: payments.mode,
          status: payments.status,
          referenceNo: payments.referenceNo,
          gatewayPaymentId: payments.gatewayPaymentId,
        })
        .from(paymentAllocations)
        .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
        .where(eq(paymentAllocations.invoiceId, invoiceId));

      return toFeeInvoiceDto({ invoice: inv, lines, payments: paymentRows });
    });
  }

  // ---------------------------------------------------------------------------
  // Collection
  // ---------------------------------------------------------------------------

  async collectPayment(dto: CollectPaymentDto) {
    const ctx = RequestContextStore.get();
    const allocSum = dto.allocations.reduce((s, a) => s + a.amountPaise, 0);
    if (allocSum !== dto.amountPaise) {
      throw new ApiException(
        400,
        'VALIDATION_ERROR',
        'Allocation total must equal payment amountPaise.',
        { amountPaise: dto.amountPaise, allocationsTotal: allocSum },
      );
    }

    return this.db.run(async (tx) => {
      if (dto.clientMutationId) {
        const [existing] = await tx
          .select({
            id: payments.id,
            receiptNo: payments.receiptNo,
            status: payments.status,
            amountPaise: payments.amountPaise,
          })
          .from(payments)
          .where(eq(payments.clientMutationId, dto.clientMutationId))
          .limit(1);
        if (existing) return existing;
      }

      // Use the first invoice's session for receipt sequencing.
      const [firstInv] = await tx
        .select({
          academicSessionId: invoices.academicSessionId,
          balancePaise: invoices.balancePaise,
          id: invoices.id,
        })
        .from(invoices)
        .where(eq(invoices.id, dto.allocations[0]!.invoiceId))
        .limit(1);
      if (!firstInv) throw new ApiException(404, 'NOT_FOUND', 'Invoice not found');

      const receiptNo = await nextReceiptNo(
        tx,
        ctx.branchId!,
        firstInv.academicSessionId,
      );

      const [payment] = await tx
        .insert(payments)
        .values({
          tenantId: ctx.tenantId!,
          branchId: ctx.branchId!,
          studentId: dto.studentId,
          receiptNo,
          paymentDate: dto.paymentDate,
          amountPaise: dto.amountPaise,
          mode: dto.mode,
          status: 'success',
          referenceNo: dto.referenceNo,
          bankName: dto.bankName,
          instrumentDate: dto.instrumentDate,
          collectedByUserId: ctx.userId,
          remarks: dto.remarks,
          clientMutationId: dto.clientMutationId,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({
          id: payments.id,
          receiptNo: payments.receiptNo,
          status: payments.status,
          amountPaise: payments.amountPaise,
        });

      await tx.insert(paymentAllocations).values(
        dto.allocations.map((a) => ({
          tenantId: ctx.tenantId!,
          paymentId: payment!.id,
          invoiceId: a.invoiceId,
          invoiceLineId: a.invoiceLineId,
          amountPaise: a.amountPaise,
        })),
      );

      for (const a of dto.allocations) {
        await this.applyAllocationToInvoice(tx, a.invoiceId, a.amountPaise);
      }

      RequestContextStore.addAudit({
        action: 'fee.payment.collect',
        entityType: 'payment',
        entityId: payment!.id,
      });

      return payment;
    });
  }

  async initiateOnline(dto: InitiateOnlinePaymentDto, grant: GrantedPermission) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const invs = await tx
        .select({
          id: invoices.id,
          studentId: invoices.studentId,
          balancePaise: invoices.balancePaise,
          academicSessionId: invoices.academicSessionId,
        })
        .from(invoices)
        .where(inArray(invoices.id, dto.invoiceIds));

      if (invs.length !== dto.invoiceIds.length) {
        throw new ApiException(404, 'NOT_FOUND', 'One or more invoices were not found.');
      }

      for (const inv of invs) {
        assertInScope(grant, { studentId: inv.studentId });
      }

      const studentIds = [...new Set(invs.map((i) => i.studentId))];
      if (studentIds.length !== 1 && grant.scope === 'self') {
        // Multi-child combined checkout is allowed for family (self) — same guardian.
        for (const sid of studentIds) assertInScope(grant, { studentId: sid });
      }

      const total = invs.reduce((s, i) => s + i.balancePaise, 0);
      const amountPaise = dto.amountPaise ?? total;
      if (amountPaise <= 0) {
        throw new ApiException(422, 'NOTHING_DUE', 'Selected invoices have zero balance.');
      }

      const primary = invs[0]!;
      const gatewayOrderId = `order_${primary.id.slice(0, 8)}_${Date.now()}`;

      const [payment] = await tx
        .insert(payments)
        .values({
          tenantId: ctx.tenantId!,
          branchId: ctx.branchId!,
          studentId: primary.studentId,
          paymentDate: new Date().toISOString().slice(0, 10),
          amountPaise,
          mode: 'upi',
          status: 'initiated',
          gatewayName: 'stub',
          gatewayOrderId,
          paidByUserId: ctx.userId,
          clientMutationId: dto.clientMutationId,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({
          id: payments.id,
          gatewayOrderId: payments.gatewayOrderId,
          amountPaise: payments.amountPaise,
          status: payments.status,
        });

      // Pre-create allocations so webhook can settle without re-parsing invoices.
      let remaining = amountPaise;
      const allocs: Array<{ invoiceId: string; amountPaise: number }> = [];
      for (const inv of invs) {
        if (remaining <= 0) break;
        const take = Math.min(inv.balancePaise, remaining);
        if (take <= 0) continue;
        allocs.push({ invoiceId: inv.id, amountPaise: take });
        remaining -= take;
      }
      if (allocs.length > 0) {
        await tx.insert(paymentAllocations).values(
          allocs.map((a) => ({
            tenantId: ctx.tenantId!,
            paymentId: payment!.id,
            invoiceId: a.invoiceId,
            amountPaise: a.amountPaise,
          })),
        );
      }

      // Public webhook has no JWT tenant — resolve via Redis (or body.tenantId).
      await this.redis.set(
        `fees:order:${gatewayOrderId}`,
        JSON.stringify({
          tenantId: ctx.tenantId,
          paymentId: payment!.id,
        }),
        'EX',
        ORDER_REDIS_TTL_SEC,
      );

      return {
        paymentId: payment!.id,
        gatewayOrderId: payment!.gatewayOrderId,
        amountPaise: payment!.amountPaise,
        status: payment!.status,
        /** Stub checkout URL — real gateway replaces this. */
        checkoutUrl: `${this.config.get('APP_BASE_URL')}/pay/stub/${payment!.id}`,
      };
    });
  }

  async handleWebhook(dto: GatewayWebhookDto, rawBody: string, signatureHeader?: string) {
    this.verifyWebhookSignature(rawBody, signatureHeader ?? dto.signature);

    const orderId = dto.gatewayOrderId;
    let tenantId = dto.tenantId ?? null;
    let paymentIdHint: string | null = null;

    if (orderId) {
      const cached = await this.redis.get(`fees:order:${orderId}`);
      if (cached) {
        const parsed = JSON.parse(cached) as { tenantId: string; paymentId: string };
        tenantId = tenantId ?? parsed.tenantId;
        paymentIdHint = parsed.paymentId;
      }
    }

    if (!tenantId) {
      throw new ApiException(
        400,
        'TENANT_REQUIRED',
        'Webhook must include tenantId (or a known gatewayOrderId from initiate).',
      );
    }

    return this.db.asTenant(tenantId, async (tx) => {
      const [byGateway] = await tx
        .select({
          id: payments.id,
          status: payments.status,
          receiptNo: payments.receiptNo,
          amountPaise: payments.amountPaise,
          gatewayPaymentId: payments.gatewayPaymentId,
        })
        .from(payments)
        .where(eq(payments.gatewayPaymentId, dto.gatewayPaymentId))
        .limit(1);

      if (byGateway) {
        return {
          paymentId: byGateway.id,
          status: byGateway.status,
          receiptNo: byGateway.receiptNo,
          replayed: true,
        };
      }

      let payment: {
        id: string;
        status: string;
        amountPaise: number;
        branchId: string;
        studentId: string;
      } | undefined;

      if (paymentIdHint) {
        const [row] = await tx
          .select({
            id: payments.id,
            status: payments.status,
            amountPaise: payments.amountPaise,
            branchId: payments.branchId,
            studentId: payments.studentId,
          })
          .from(payments)
          .where(eq(payments.id, paymentIdHint))
          .limit(1);
        payment = row;
      } else if (orderId) {
        const [row] = await tx
          .select({
            id: payments.id,
            status: payments.status,
            amountPaise: payments.amountPaise,
            branchId: payments.branchId,
            studentId: payments.studentId,
          })
          .from(payments)
          .where(eq(payments.gatewayOrderId, orderId))
          .limit(1);
        payment = row;
      }

      if (!payment) {
        throw new ApiException(404, 'NOT_FOUND', 'Payment not found for gateway order.');
      }

      if (payment.status === 'success') {
        return {
          paymentId: payment.id,
          status: payment.status,
          replayed: true,
        };
      }

      if (dto.status === 'failed') {
        await tx
          .update(payments)
          .set({
            status: 'failed',
            gatewayPaymentId: dto.gatewayPaymentId,
            gatewayResponse: dto.raw ?? { status: 'failed' },
            updatedAt: new Date(),
          })
          .where(eq(payments.id, payment.id));
        return { paymentId: payment.id, status: 'failed', replayed: false };
      }

      const [alloc] = await tx
        .select({ invoiceId: paymentAllocations.invoiceId })
        .from(paymentAllocations)
        .where(eq(paymentAllocations.paymentId, payment.id))
        .limit(1);

      let academicSessionId: string | null = null;
      if (alloc) {
        const [inv] = await tx
          .select({ academicSessionId: invoices.academicSessionId })
          .from(invoices)
          .where(eq(invoices.id, alloc.invoiceId))
          .limit(1);
        academicSessionId = inv?.academicSessionId ?? null;
      }

      const receiptNo = academicSessionId
        ? await nextReceiptNo(tx, payment.branchId, academicSessionId)
        : `RCPT-${dto.gatewayPaymentId.slice(-8)}`;

      await tx
        .update(payments)
        .set({
          status: 'success',
          receiptNo,
          gatewayPaymentId: dto.gatewayPaymentId,
          gatewayResponse: dto.raw ?? { status: 'success' },
          updatedAt: new Date(),
        })
        .where(eq(payments.id, payment.id));

      const allocs = await tx
        .select({
          invoiceId: paymentAllocations.invoiceId,
          amountPaise: paymentAllocations.amountPaise,
        })
        .from(paymentAllocations)
        .where(eq(paymentAllocations.paymentId, payment.id));

      for (const a of allocs) {
        await this.applyAllocationToInvoice(tx, a.invoiceId, a.amountPaise);
      }

      return {
        paymentId: payment.id,
        status: 'success',
        receiptNo,
        replayed: false,
      };
    });
  }

  async getPayment(id: string, grant: GrantedPermission) {
    const row = await this.db.run(async (tx) => {
      const [found] = await tx
        .select({
          id: payments.id,
          studentId: payments.studentId,
          receiptNo: payments.receiptNo,
          paymentDate: payments.paymentDate,
          amountPaise: payments.amountPaise,
          mode: payments.mode,
          status: payments.status,
          referenceNo: payments.referenceNo,
          gatewayOrderId: payments.gatewayOrderId,
          gatewayPaymentId: payments.gatewayPaymentId,
        })
        .from(payments)
        .where(eq(payments.id, id))
        .limit(1);
      if (!found) throw new ApiException(404, 'NOT_FOUND', 'Payment not found');
      return found;
    });
    // FeeStatusDto / FeeInvoiceDto separation is useless if a parent can
    // fetch another family's payment by UUID and see gateway references.
    assertInScope(grant, { studentId: row.studentId });
    return row;
  }

  /** Family poll after checkout — same ownership check as staff getPayment. */
  async getPaymentForFamily(id: string, grant: GrantedPermission) {
    return this.getPayment(id, grant);
  }

  async refundPayment(id: string, dto: RefundPaymentDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [payment] = await tx
        .select({
          id: payments.id,
          status: payments.status,
          amountPaise: payments.amountPaise,
        })
        .from(payments)
        .where(eq(payments.id, id))
        .limit(1);
      if (!payment) throw new ApiException(404, 'NOT_FOUND', 'Payment not found');
      if (payment.status !== 'success' && payment.status !== 'partially_refunded') {
        throw new ApiException(422, 'NOT_REFUNDABLE', 'Only successful payments can be refunded.');
      }
      if (dto.amountPaise > payment.amountPaise) {
        throw new ApiException(400, 'VALIDATION_ERROR', 'Refund exceeds payment amount.');
      }

      const full = dto.amountPaise === payment.amountPaise;
      const [updated] = await tx
        .update(payments)
        .set({
          status: full ? 'refunded' : 'partially_refunded',
          remarks: dto.reason,
          updatedAt: new Date(),
          updatedBy: ctx.userId,
        })
        .where(eq(payments.id, id))
        .returning({ id: payments.id, status: payments.status });

      // Reverse allocations proportionally by undoing paid amounts on invoices.
      const allocs = await tx
        .select({
          invoiceId: paymentAllocations.invoiceId,
          amountPaise: paymentAllocations.amountPaise,
        })
        .from(paymentAllocations)
        .where(eq(paymentAllocations.paymentId, id));

      for (const a of allocs) {
        const share = full
          ? a.amountPaise
          : Math.floor((a.amountPaise * dto.amountPaise) / payment.amountPaise);
        await this.applyAllocationToInvoice(tx, a.invoiceId, -share);
      }

      return updated;
    });
  }

  // ---------------------------------------------------------------------------
  // Reconciliation
  // ---------------------------------------------------------------------------

  async reconciliationWorklist() {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const unmatchedPayments = await tx
        .select({
          id: payments.id,
          amountPaise: payments.amountPaise,
          paymentDate: payments.paymentDate,
          mode: payments.mode,
          referenceNo: payments.referenceNo,
          receiptNo: payments.receiptNo,
          status: payments.status,
        })
        .from(payments)
        .where(
          and(
            eq(payments.branchId, ctx.branchId!),
            eq(payments.status, 'success'),
            isNull(payments.reconciledAt),
          ),
        )
        .orderBy(desc(payments.paymentDate))
        .limit(200);

      const unmatchedSettlements = await tx
        .select({
          id: settlements.id,
          valueDate: settlements.valueDate,
          netAmountPaise: settlements.netAmountPaise,
          narration: settlements.narration,
          sourceRef: settlements.sourceRef,
          matchStatus: settlements.matchStatus,
          matchedAmountPaise: settlements.matchedAmountPaise,
        })
        .from(settlements)
        .where(
          and(
            eq(settlements.branchId, ctx.branchId!),
            inArray(settlements.matchStatus, ['unmatched', 'partial', 'exception']),
          ),
        )
        .orderBy(desc(settlements.valueDate))
        .limit(200);

      return { unmatchedPayments, unmatchedSettlements };
    });
  }

  async importSettlements(dto: ImportSettlementsDto) {
    const ctx = RequestContextStore.get();
    const lines = dto.csv
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.toLowerCase().startsWith('valuedate'));

    const parsed: Array<{
      valueDate: string;
      netAmountPaise: number;
      narration: string | null;
      sourceRef: string | null;
    }> = [];

    for (const line of lines) {
      const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      if (cols.length < 2) continue;
      const valueDate = cols[0]!;
      const netAmountPaise = Number(cols[1]);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(valueDate) || !Number.isInteger(netAmountPaise)) {
        throw new ApiException(
          400,
          'CSV_PARSE_ERROR',
          `Invalid CSV row: ${line}. Expected valueDate,netAmountPaise,narration,sourceRef`,
        );
      }
      parsed.push({
        valueDate,
        netAmountPaise,
        narration: cols[2] ?? null,
        sourceRef: cols[3] ?? null,
      });
    }

    return this.db.run(async (tx) => {
      if (parsed.length === 0) return { imported: 0 };

      const inserted = await tx
        .insert(settlements)
        .values(
          parsed.map((p) => ({
            tenantId: ctx.tenantId!,
            branchId: ctx.branchId!,
            source: dto.source ?? 'bank_statement',
            sourceRef: p.sourceRef,
            valueDate: p.valueDate,
            grossAmountPaise: p.netAmountPaise,
            netAmountPaise: p.netAmountPaise,
            narration: p.narration,
            matchStatus: 'unmatched' as const,
            createdBy: ctx.userId,
            updatedBy: ctx.userId,
          })),
        )
        .returning({ id: settlements.id });

      return { imported: inserted.length };
    });
  }

  async autoMatch() {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const unsettled = await tx
        .select({
          id: settlements.id,
          valueDate: settlements.valueDate,
          netAmountPaise: settlements.netAmountPaise,
          narration: settlements.narration,
          sourceRef: settlements.sourceRef,
          matchedAmountPaise: settlements.matchedAmountPaise,
        })
        .from(settlements)
        .where(
          and(
            eq(settlements.branchId, ctx.branchId!),
            inArray(settlements.matchStatus, ['unmatched', 'partial']),
          ),
        )
        .limit(100);

      const openPayments = await tx
        .select({
          id: payments.id,
          amountPaise: payments.amountPaise,
          paymentDate: payments.paymentDate,
          referenceNo: payments.referenceNo,
          receiptNo: payments.receiptNo,
        })
        .from(payments)
        .where(
          and(
            eq(payments.branchId, ctx.branchId!),
            eq(payments.status, 'success'),
            isNull(payments.reconciledAt),
          ),
        )
        .limit(500);

      let matched = 0;
      const exceptions: Array<{
        settlementId: string;
        suggestedPaymentId: string | null;
        score: number;
      }> = [];

      for (const s of unsettled) {
        const remaining = s.netAmountPaise - (s.matchedAmountPaise ?? 0);
        let best: { paymentId: string; score: number } | null = null;

        for (const p of openPayments) {
          if (p.amountPaise !== remaining && p.amountPaise !== s.netAmountPaise) continue;
          const dayDiff = Math.abs(daysBetween(s.valueDate, p.paymentDate));
          if (dayDiff > 3) continue;

          let score = 50;
          if (dayDiff === 0) score += 30;
          else score += Math.max(0, 20 - dayDiff * 5);

          const ref = (s.sourceRef ?? '') + (s.narration ?? '');
          if (p.referenceNo && ref.includes(p.referenceNo)) score += 40;
          if (p.receiptNo && ref.includes(p.receiptNo)) score += 20;

          if (!best || score > best.score) best = { paymentId: p.id, score };
        }

        if (best && best.score >= 80) {
          await this.matchSettlementTx(tx, s.id, [best.paymentId], ctx.userId);
          matched += 1;
          // Remove from open list
          const idx = openPayments.findIndex((p) => p.id === best!.paymentId);
          if (idx >= 0) openPayments.splice(idx, 1);
        } else {
          exceptions.push({
            settlementId: s.id,
            suggestedPaymentId: best?.paymentId ?? null,
            score: best?.score ?? 0,
          });
          if (best) {
            await tx
              .update(settlements)
              .set({
                matchStatus: 'exception',
                exceptionReason: `Suggested match score ${best.score}`,
                updatedAt: new Date(),
              })
              .where(eq(settlements.id, s.id));
          }
        }
      }

      return { matched, exceptions };
    });
  }

  async matchSettlement(settlementId: string, dto: MatchSettlementDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) =>
      this.matchSettlementTx(tx, settlementId, dto.paymentIds, ctx.userId),
    );
  }

  async getDaybook(day: string, counter?: string) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const totals = await this.daybookExpected(tx, ctx.branchId!, day);

      const [entry] = await tx
        .select({
          id: daybookEntries.id,
          day: daybookEntries.day,
          counterName: daybookEntries.counterName,
          openingCashPaise: daybookEntries.openingCashPaise,
          cashCollectedPaise: daybookEntries.cashCollectedPaise,
          chequeCollectedPaise: daybookEntries.chequeCollectedPaise,
          onlineCollectedPaise: daybookEntries.onlineCollectedPaise,
          cashDepositedPaise: daybookEntries.cashDepositedPaise,
          closingCashPaise: daybookEntries.closingCashPaise,
          variancePaise: daybookEntries.variancePaise,
          varianceNote: daybookEntries.varianceNote,
          isClosed: daybookEntries.isClosed,
          closedAt: daybookEntries.closedAt,
        })
        .from(daybookEntries)
        .where(
          and(
            eq(daybookEntries.branchId, ctx.branchId!),
            eq(daybookEntries.day, day),
            counter
              ? eq(daybookEntries.counterName, counter)
              : isNull(daybookEntries.counterName),
          ),
        )
        .limit(1);

      return { expected: totals, entry: entry ?? null };
    });
  }

  async closeDaybook(dto: CloseDaybookDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const expected = await this.daybookExpected(tx, ctx.branchId!, dto.day);
      const expectedClosing =
        expected.openingCashPaise +
        expected.cashCollectedPaise -
        (dto.cashDepositedPaise ?? 0);
      const variancePaise = dto.countedClosingCashPaise - expectedClosing;

      if (variancePaise !== 0 && !dto.acknowledgeVariance) {
        throw new ApiException(
          422,
          'VARIANCE_UNACKNOWLEDGED',
          `Daybook variance is ${variancePaise} paise. Add varianceNote and set acknowledgeVariance=true to close.`,
          { variancePaise, expectedClosing, counted: dto.countedClosingCashPaise },
        );
      }
      if (variancePaise !== 0 && !dto.varianceNote) {
        throw new ApiException(
          422,
          'VARIANCE_NOTE_REQUIRED',
          'A non-zero variance requires a varianceNote.',
          { variancePaise },
        );
      }

      const counterName = dto.counterName ?? 'main';
      const [existing] = await tx
        .select({ id: daybookEntries.id, isClosed: daybookEntries.isClosed })
        .from(daybookEntries)
        .where(
          and(
            eq(daybookEntries.branchId, ctx.branchId!),
            eq(daybookEntries.day, dto.day),
            eq(daybookEntries.counterName, counterName),
          ),
        )
        .limit(1);

      if (existing?.isClosed) {
        throw new ApiException(409, 'ALREADY_CLOSED', 'This daybook is already closed.');
      }

      const values = {
        tenantId: ctx.tenantId!,
        branchId: ctx.branchId!,
        day: dto.day,
        counterName,
        cashierUserId: ctx.userId,
        openingCashPaise: expected.openingCashPaise,
        cashCollectedPaise: expected.cashCollectedPaise,
        chequeCollectedPaise: expected.chequeCollectedPaise,
        onlineCollectedPaise: expected.onlineCollectedPaise,
        cashDepositedPaise: dto.cashDepositedPaise ?? 0,
        closingCashPaise: dto.countedClosingCashPaise,
        variancePaise,
        varianceNote: dto.varianceNote,
        isClosed: true,
        closedAt: new Date(),
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
        updatedAt: new Date(),
      };

      if (existing) {
        const [row] = await tx
          .update(daybookEntries)
          .set(values)
          .where(eq(daybookEntries.id, existing.id))
          .returning({
            id: daybookEntries.id,
            variancePaise: daybookEntries.variancePaise,
            isClosed: daybookEntries.isClosed,
          });
        return row;
      }

      const [row] = await tx
        .insert(daybookEntries)
        .values(values)
        .returning({
          id: daybookEntries.id,
          variancePaise: daybookEntries.variancePaise,
          isClosed: daybookEntries.isClosed,
        });
      return row;
    });
  }

  // ---------------------------------------------------------------------------
  // Defaulters
  // ---------------------------------------------------------------------------

  async listDefaulters(query: DefaultersQuery, grant: GrantedPermission) {
    const ctx = RequestContextStore.get();
    const predicate = scopeFilter(
      grant,
      {
        studentId: invoices.studentId,
        branchId: invoices.branchId,
        sectionId: studentEnrollments.sectionId,
      },
      { branchId: ctx.branchId },
    );

    return this.db.run(async (tx) => {
      const rows = await tx
        .select({
          invoiceId: invoices.id,
          studentId: invoices.studentId,
          invoiceNo: invoices.invoiceNo,
          dueDate: invoices.dueDate,
          balancePaise: invoices.balancePaise,
          status: invoices.status,
          ageingBucket: invoices.ageingBucket,
          firstName: students.firstName,
          lastName: students.lastName,
          classId: studentEnrollments.classId,
          sectionId: studentEnrollments.sectionId,
        })
        .from(invoices)
        .innerJoin(students, eq(students.id, invoices.studentId))
        .leftJoin(
          studentEnrollments,
          and(
            eq(studentEnrollments.studentId, invoices.studentId),
            eq(studentEnrollments.academicSessionId, invoices.academicSessionId),
          ),
        )
        .where(
          and(
            eq(invoices.branchId, ctx.branchId!),
            inArray(invoices.status, [...OUTSTANDING_STATUSES]),
            sql`${invoices.balancePaise} > 0`,
            query.ageingBucket != null
              ? eq(invoices.ageingBucket, query.ageingBucket)
              : undefined,
            query.classId ? eq(studentEnrollments.classId, query.classId) : undefined,
            predicate,
            // Promise-to-pay stops the chase: hide invoices with a future promise.
            sql`NOT EXISTS (
              SELECT 1 FROM fee_reminders fr
              WHERE fr.invoice_id = ${invoices.id}
                AND fr.promise_to_pay_date IS NOT NULL
                AND fr.promise_to_pay_date >= CURRENT_DATE
                AND (fr.promise_kept IS NULL OR fr.promise_kept = false)
            )`,
          ),
        )
        .orderBy(invoices.dueDate)
        .limit(Math.min(query.limit ?? 50, 100));

      return {
        data: rows.map((r) => ({
          invoiceId: r.invoiceId,
          studentId: r.studentId,
          studentName: [r.firstName, r.lastName].filter(Boolean).join(' '),
          invoiceNo: r.invoiceNo,
          dueDate: r.dueDate,
          balancePaise: r.balancePaise,
          status: r.status,
          ageingBucket: r.ageingBucket ?? 0,
          classId: r.classId,
          sectionId: r.sectionId,
        })),
      };
    });
  }

  async remindDefaulters(dto: RemindDefaultersDto) {
    const ctx = RequestContextStore.get();
    const channel =
      dto.ladderStep === 1
        ? 'app'
        : dto.ladderStep === 2
          ? 'whatsapp'
          : dto.ladderStep === 3
            ? 'sms'
            : 'office_call';

    return this.db.run(async (tx) => {
      const invs = await tx
        .select({
          id: invoices.id,
          studentId: invoices.studentId,
          balancePaise: invoices.balancePaise,
        })
        .from(invoices)
        .where(inArray(invoices.id, dto.invoiceIds));

      if (invs.length === 0) return { sent: 0 };

      await tx.insert(feeReminders).values(
        invs.map((inv) => ({
          tenantId: ctx.tenantId!,
          invoiceId: inv.id,
          studentId: inv.studentId,
          ladderStep: dto.ladderStep,
          channel,
          sentAt: new Date(),
          outstandingAtSendPaise: inv.balancePaise,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })),
      );

      // Actual WhatsApp/SMS fan-out is a BullMQ concern — record the intent here.
      return { sent: invs.length, channel, ladderStep: dto.ladderStep };
    });
  }

  async promiseToPay(invoiceId: string, dto: PromiseToPayDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [inv] = await tx
        .select({
          id: invoices.id,
          studentId: invoices.studentId,
          balancePaise: invoices.balancePaise,
        })
        .from(invoices)
        .where(eq(invoices.id, invoiceId))
        .limit(1);
      if (!inv) throw new ApiException(404, 'NOT_FOUND', 'Invoice not found');

      const [row] = await tx
        .insert(feeReminders)
        .values({
          tenantId: ctx.tenantId!,
          invoiceId: inv.id,
          studentId: inv.studentId,
          ladderStep: 0,
          channel: 'promise',
          promiseToPayDate: dto.promiseToPayDate,
          outstandingAtSendPaise: inv.balancePaise,
          notes: dto.notes,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({
          id: feeReminders.id,
          promiseToPayDate: feeReminders.promiseToPayDate,
        });
      return row;
    });
  }

  // ---------------------------------------------------------------------------
  // Family
  // ---------------------------------------------------------------------------

  async familyFeesOverview(studentId: string, grant: GrantedPermission) {
    assertInScope(grant, { studentId });
    return this.db.run(async (tx) => {
      const rows = await tx
        .select({
          id: invoices.id,
          invoiceNo: invoices.invoiceNo,
          dueDate: invoices.dueDate,
          balancePaise: invoices.balancePaise,
          netAmountPaise: invoices.netAmountPaise,
          status: invoices.status,
          termId: invoices.termId,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.studentId, studentId),
            sql`${invoices.status} <> 'cancelled'`,
          ),
        )
        .orderBy(invoices.dueDate);

      const outstandingPaise = rows
        .filter((r) => OUTSTANDING_STATUSES.includes(r.status as (typeof OUTSTANDING_STATUSES)[number]))
        .reduce((s, r) => s + r.balancePaise, 0);

      return {
        outstandingPaise,
        invoices: rows.map((r) => ({
          id: r.id,
          termName: r.invoiceNo,
          dueLabel: formatDueLabel(r.dueDate, r.status),
          amountPaise: r.balancePaise > 0 ? r.balancePaise : r.netAmountPaise,
          status: mapFamilyStatus(r.status),
        })),
      };
    });
  }

  async outstandingPaiseForStudent(studentId: string): Promise<number> {
    return this.db.run(async (tx) => {
      const [row] = await tx
        .select({
          total: sql<number>`coalesce(sum(${invoices.balancePaise}), 0)`.mapWith(Number),
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.studentId, studentId),
            inArray(invoices.status, [...OUTSTANDING_STATUSES]),
          ),
        );
      return row?.total ?? 0;
    });
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async structureGrossTotal(tx: Tx, structureId: string): Promise<number> {
    const [row] = await tx
      .select({
        total: sql<number>`coalesce(sum(${feeStructureItems.amountPaise}), 0)`.mapWith(Number),
      })
      .from(feeStructureItems)
      .where(eq(feeStructureItems.feeStructureId, structureId));
    return row?.total ?? 0;
  }

  private async applyAllocationToInvoice(
    tx: Tx,
    invoiceId: string,
    amountPaise: number,
  ): Promise<void> {
    const [inv] = await tx
      .select({
        id: invoices.id,
        paidAmountPaise: invoices.paidAmountPaise,
        netAmountPaise: invoices.netAmountPaise,
        status: invoices.status,
      })
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);
    if (!inv) throw new ApiException(404, 'NOT_FOUND', 'Invoice not found');

    const paid = inv.paidAmountPaise + amountPaise;
    if (paid < 0) {
      throw new ApiException(422, 'OVER_REFUND', 'Refund would make paid amount negative.');
    }
    const balance = inv.netAmountPaise - paid;
    const status =
      balance <= 0 ? 'paid' : paid > 0 ? 'partially_paid' : inv.status === 'overdue' ? 'overdue' : 'issued';

    await tx
      .update(invoices)
      .set({
        paidAmountPaise: paid,
        balancePaise: Math.max(0, balance),
        status,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));
  }

  private async matchSettlementTx(
    tx: Tx,
    settlementId: string,
    paymentIds: string[],
    userId: string | null,
  ) {
    const [settlement] = await tx
      .select({
        id: settlements.id,
        netAmountPaise: settlements.netAmountPaise,
        matchedAmountPaise: settlements.matchedAmountPaise,
      })
      .from(settlements)
      .where(eq(settlements.id, settlementId))
      .limit(1);
    if (!settlement) throw new ApiException(404, 'NOT_FOUND', 'Settlement not found');

    const pays = await tx
      .select({
        id: payments.id,
        amountPaise: payments.amountPaise,
        reconciledAt: payments.reconciledAt,
      })
      .from(payments)
      .where(inArray(payments.id, paymentIds));

    if (pays.length !== paymentIds.length) {
      throw new ApiException(404, 'NOT_FOUND', 'One or more payments were not found.');
    }
    if (pays.some((p) => p.reconciledAt)) {
      throw new ApiException(409, 'ALREADY_RECONCILED', 'A payment is already reconciled.');
    }

    const add = pays.reduce((s, p) => s + p.amountPaise, 0);
    const matchedAmountPaise = (settlement.matchedAmountPaise ?? 0) + add;
    const matchStatus =
      matchedAmountPaise >= settlement.netAmountPaise
        ? 'matched'
        : matchedAmountPaise > 0
          ? 'partial'
          : 'unmatched';

    await tx
      .update(settlements)
      .set({
        matchedAmountPaise,
        matchStatus,
        reconciledByUserId: matchStatus === 'matched' ? userId : null,
        reconciledAt: matchStatus === 'matched' ? new Date() : null,
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(eq(settlements.id, settlementId));

    await tx
      .update(payments)
      .set({
        settlementId,
        reconciledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(inArray(payments.id, paymentIds));

    return { settlementId, matchedAmountPaise, matchStatus, paymentIds };
  }

  private async daybookExpected(tx: Tx, branchId: string, day: string) {
    const rows = await tx
      .select({
        mode: payments.mode,
        total: sql<number>`coalesce(sum(${payments.amountPaise}), 0)`.mapWith(Number),
      })
      .from(payments)
      .where(
        and(
          eq(payments.branchId, branchId),
          eq(payments.paymentDate, day),
          eq(payments.status, 'success'),
        ),
      )
      .groupBy(payments.mode);

    let cashCollectedPaise = 0;
    let chequeCollectedPaise = 0;
    let onlineCollectedPaise = 0;
    for (const r of rows) {
      if (r.mode === 'cash') cashCollectedPaise = r.total;
      else if (r.mode === 'cheque' || r.mode === 'dd') chequeCollectedPaise += r.total;
      else onlineCollectedPaise += r.total;
    }

    return {
      openingCashPaise: 0,
      cashCollectedPaise,
      chequeCollectedPaise,
      onlineCollectedPaise,
    };
  }

  private verifyWebhookSignature(rawBody: string, signature?: string): void {
    const secret = this.config.get<string>('FEES_GATEWAY_WEBHOOK_SECRET');
    if (!secret) {
      // Dev/stub: allow unsigned when secret is unset.
      if (this.config.get('NODE_ENV') === 'production') {
        throw new ApiException(
          500,
          'MISCONFIGURED',
          'FEES_GATEWAY_WEBHOOK_SECRET is not set.',
        );
      }
      return;
    }
    if (!signature) {
      throw new ApiException(401, 'INVALID_SIGNATURE', 'Missing webhook signature.');
    }
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ApiException(401, 'INVALID_SIGNATURE', 'Webhook signature mismatch.');
    }
  }
}

function daysBetween(a: string, b: string): number {
  const ms = Date.parse(a) - Date.parse(b);
  return Math.round(ms / 86_400_000);
}

function mapFamilyStatus(status: string): string {
  switch (status) {
    case 'paid':
      return 'paid';
    case 'overdue':
      return 'overdue';
    case 'partially_paid':
      return 'partial';
    default:
      return 'due';
  }
}

function formatDueLabel(dueDate: string, status: string): string {
  if (status === 'paid') return 'Paid';
  if (status === 'overdue') return `Overdue · due ${dueDate}`;
  return `Due ${dueDate}`;
}

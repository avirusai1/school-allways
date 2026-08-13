import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  academicSessions,
  branches,
  platformInvoices,
  studentSubscriptions,
  tenants,
} from '@saw/db';

import { RequestContextStore, createEmptyContext } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { PARENT_SUBSCRIPTION_TOTAL_PAISE } from './billing.constants';
import { InvoiceService } from './invoice.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const INVOICE_ID = '22222222-2222-2222-2222-222222222222';

function thenable(rows: unknown[]) {
  const self: {
    from: () => typeof self;
    where: () => typeof self;
    limit: () => Promise<unknown[]>;
    orderBy: () => typeof self;
    innerJoin: () => typeof self;
    then: (resolve: (v: unknown[]) => unknown, reject?: (e: unknown) => unknown) => Promise<unknown>;
  } = {
    from: () => self,
    where: () => self,
    orderBy: () => self,
    innerJoin: () => self,
    limit: () => Promise.resolve(rows),
    then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
  };
  return self;
}

function makeTx(opts: {
  unbilled?: Array<{ id: string }>;
  insertValues?: { current: Record<string, unknown> | null };
  invoiceRow?: Record<string, unknown> | null;
  updates?: Array<Record<string, unknown>>;
}) {
  const insertValues = opts.insertValues ?? { current: null };
  const updates = opts.updates ?? [];
  return {
    select: () => ({
      from: (table: unknown) => {
        if (table === tenants) {
          return thenable([{ name: 'Demo School', legalName: 'Demo Education Pvt Ltd' }]);
        }
        if (table === branches) {
          return thenable([
            {
              state: 'Maharashtra',
              city: 'Pune',
              addressLine1: '1 MG Road',
              pincode: '411001',
            },
          ]);
        }
        if (table === academicSessions) {
          return thenable([{ id: 'sess-1', name: '2026-27' }]);
        }
        if (table === studentSubscriptions) {
          return thenable(opts.unbilled ?? [{ id: 'sub-1' }, { id: 'sub-2' }]);
        }
        if (table === platformInvoices) {
          return thenable(opts.invoiceRow ? [opts.invoiceRow] : []);
        }
        return thenable([]);
      },
    }),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        insertValues.current = v;
        return {
          returning: async () => [
            { id: INVOICE_ID, invoiceNumber: v.invoiceNumber as string },
          ],
        };
      },
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => {
        updates.push(v);
        return { where: async () => undefined };
      },
    }),
    execute: async () => [{ last_number: 7 }],
  };
}

const firmConfig = {
  get: (key: string) => {
    const map: Record<string, string> = {
      FIRM_NAME: 'Saw Education LLP',
      FIRM_GSTIN: '27AAPFU0939F1ZV',
      FIRM_ADDRESS: 'Pune, Maharashtra',
      FIRM_STATE_CODE: '27',
    };
    return map[key];
  },
};

describe('InvoiceService.generate — PDF off the transaction', () => {
  const insertValues = { current: null as Record<string, unknown> | null };
  const storage = {
    writeBuffer: vi.fn(),
    ensureDirForKey: vi.fn(),
    exists: vi.fn(),
    readBuffer: vi.fn(),
  };
  const queue = {
    enqueue: vi.fn(),
    reenqueue: vi.fn(),
    jobId: (id: string) => `pinv-pdf-${id}`,
  };

  let inTx = false;
  let service: InvoiceService;

  beforeEach(() => {
    vi.clearAllMocks();
    insertValues.current = null;
    inTx = false;
    storage.writeBuffer.mockImplementation(async () => {
      if (inTx) throw new Error('writeBuffer must not run inside the issue transaction');
    });
    queue.enqueue.mockResolvedValue({ jobId: `pinv-pdf-${INVOICE_ID}`, queued: true });

    const tx = makeTx({ insertValues });
    const db = {
      run: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        inTx = true;
        try {
          return await fn(tx);
        } finally {
          inTx = false;
        }
      }),
      asTenant: vi.fn(),
    };

    service = new InvoiceService(db as never, firmConfig as never, storage as never, queue as never);
  });

  it('commits with pdfStatus pending and pdfPath null, and does not write a PDF during generate', async () => {
    const result = await RequestContextStore.run(
      { ...createEmptyContext('r1'), isPlatformAdmin: true, userId: 'agent-1' },
      () => service.generate(TENANT_ID, 'manual_activations'),
    );

    expect(result.pdfPath).toBeNull();
    expect(result.pdfStatus).toBe('pending');
    expect(result.id).toBe(INVOICE_ID);
    expect(result.invoiceNumber).toMatch(/^SAW\/\d{4}-\d{2}\/000007$/);
    expect(insertValues.current?.pdfStatus).toBe('pending');
    expect(insertValues.current?.pdfPath).toBeNull();
    expect(storage.writeBuffer).not.toHaveBeenCalled();
    expect(storage.ensureDirForKey).not.toHaveBeenCalled();
    expect(queue.enqueue).toHaveBeenCalledWith({ invoiceId: INVOICE_ID, tenantId: TENANT_ID });
    expect(result.totalPaise).toBe(2 * PARENT_SUBSCRIPTION_TOTAL_PAISE);
  });

  it('still returns a numbered invoice when enqueue .add() rejects', async () => {
    const { SubscriptionsQueueService } = await import('./subscriptions-queue.service');
    const realQueue = new SubscriptionsQueueService({} as never);
    vi.spyOn(
      realQueue as unknown as { getQueue: () => { add: () => Promise<never> } },
      'getQueue',
    ).mockReturnValue({
      add: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    });

    const tx = makeTx({ insertValues });
    const db = {
      run: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
      asTenant: vi.fn(),
    };
    const svc = new InvoiceService(db as never, firmConfig as never, storage as never, realQueue);

    const result = await RequestContextStore.run(
      { ...createEmptyContext('r1'), isPlatformAdmin: true, userId: 'agent-1' },
      () => svc.generate(TENANT_ID, 'manual_activations'),
    );

    expect(result.invoiceNumber).toMatch(/^SAW\/\d{4}-\d{2}\/000007$/);
    expect(result.pdfStatus).toBe('pending');
    expect(result.pdfPath).toBeNull();
    expect(storage.writeBuffer).not.toHaveBeenCalled();
  });
});

describe('InvoiceService.renderQueuedPdf', () => {
  it('writes the PDF and sets pdfPath + ready', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const issuedAt = new Date('2026-08-13T10:00:00.000Z');
    const invoiceRow = {
      id: INVOICE_ID,
      tenantId: TENANT_ID,
      invoiceNumber: 'SAW/2026-27/000007',
      kind: 'manual_activations',
      lineItems: [
        {
          description: 'Parent subscriptions collected in cash — 2026-27 (2 students)',
          quantity: 2,
          unitPaise: 36_500,
          amountPaise: 73_000,
        },
      ],
      basePaise: 61_864,
      cgstPaise: 5_568,
      sgstPaise: 5_568,
      igstPaise: 0,
      totalPaise: 73_000,
      placeOfSupply: '27 — Maharashtra',
      issuedAt,
    };
    const tx = makeTx({ invoiceRow, updates });
    const storage = {
      writeBuffer: vi.fn().mockResolvedValue(undefined),
      ensureDirForKey: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn(),
      readBuffer: vi.fn(),
    };
    const db = {
      run: vi.fn(),
      asTenant: vi.fn(async (_id: string, fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    };
    const service = new InvoiceService(
      db as never,
      firmConfig as never,
      storage as never,
      { enqueue: vi.fn(), reenqueue: vi.fn(), jobId: (id: string) => `pinv-pdf-${id}` } as never,
    );

    await service.renderQueuedPdf(INVOICE_ID, TENANT_ID);

    expect(storage.ensureDirForKey).toHaveBeenCalled();
    expect(storage.writeBuffer).toHaveBeenCalledOnce();
    const [path, buf] = storage.writeBuffer.mock.calls[0] as [string, Buffer];
    expect(path).toBe(`t/${TENANT_ID}/platform-invoices/SAW-2026-27-000007.pdf`);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(updates.some((u) => u.pdfStatus === 'ready' && u.pdfPath === path)).toBe(true);
  });
});

describe('InvoiceService.getPdf', () => {
  function serviceWith(row: Record<string, unknown> | null, storageOverrides: Record<string, unknown> = {}) {
    const tx = makeTx({ invoiceRow: row });
    const storage = {
      writeBuffer: vi.fn(),
      ensureDirForKey: vi.fn(),
      exists: vi.fn().mockResolvedValue(false),
      readBuffer: vi.fn(),
      ...storageOverrides,
    };
    const db = {
      run: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
      asTenant: vi.fn(),
    };
    return {
      service: new InvoiceService(
        db as never,
        firmConfig as never,
        storage as never,
        { enqueue: vi.fn(), reenqueue: vi.fn(), jobId: (id: string) => `pinv-pdf-${id}` } as never,
      ),
      storage,
    };
  }

  it('returns 409 INVOICE_PDF_PENDING when the PDF is not ready', async () => {
    const { service } = serviceWith({
      id: INVOICE_ID,
      tenantId: TENANT_ID,
      invoiceNumber: 'SAW/2026-27/000007',
      pdfPath: null,
      pdfStatus: 'pending',
    });
    await expect(service.getPdf(TENANT_ID, INVOICE_ID)).rejects.toMatchObject({
      code: 'INVOICE_PDF_PENDING',
    });
    await service.getPdf(TENANT_ID, INVOICE_ID).catch((err: unknown) => {
      expect((err as ApiException).getStatus()).toBe(409);
    });
  });

  it('returns 409 INVOICE_PDF_FAILED after a terminal render failure', async () => {
    const { service } = serviceWith({
      id: INVOICE_ID,
      tenantId: TENANT_ID,
      invoiceNumber: 'SAW/2026-27/000007',
      pdfPath: null,
      pdfStatus: 'failed',
    });
    await expect(service.getPdf(TENANT_ID, INVOICE_ID)).rejects.toMatchObject({
      code: 'INVOICE_PDF_FAILED',
    });
    try {
      await service.getPdf(TENANT_ID, INVOICE_ID);
    } catch (err) {
      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).getStatus()).toBe(409);
    }
  });

  it('returns 200 PDF bytes when ready and the file exists', async () => {
    const pdf = Buffer.from('%PDF-1.4 test');
    const { service } = serviceWith(
      {
        id: INVOICE_ID,
        tenantId: TENANT_ID,
        invoiceNumber: 'SAW/2026-27/000007',
        pdfPath: `t/${TENANT_ID}/platform-invoices/SAW-2026-27-000007.pdf`,
        pdfStatus: 'ready',
      },
      {
        exists: vi.fn().mockResolvedValue(true),
        readBuffer: vi.fn().mockResolvedValue(pdf),
      },
    );
    const result = await service.getPdf(TENANT_ID, INVOICE_ID);
    expect(result.buffer).toEqual(pdf);
    expect(result.filename).toBe('SAW-2026-27-000007.pdf');
  });

  it('returns 404 for an unknown invoice id', async () => {
    const { service } = serviceWith(null);
    await expect(service.getPdf(TENANT_ID, INVOICE_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    try {
      await service.getPdf(TENANT_ID, INVOICE_ID);
    } catch (err) {
      expect((err as ApiException).getStatus()).toBe(404);
    }
  });

  it('returns 404 when ready but the file is missing from storage', async () => {
    const { service } = serviceWith({
      id: INVOICE_ID,
      tenantId: TENANT_ID,
      invoiceNumber: 'SAW/2026-27/000007',
      pdfPath: `t/${TENANT_ID}/platform-invoices/SAW-2026-27-000007.pdf`,
      pdfStatus: 'ready',
    });
    await expect(service.getPdf(TENANT_ID, INVOICE_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('pdfLines privacy — aggregate only', () => {
  it('emits a student count and never a student or parent name', () => {
    const service = new InvoiceService(
      {} as never,
      firmConfig as never,
      {} as never,
      { enqueue: vi.fn(), reenqueue: vi.fn(), jobId: (id: string) => `pinv-pdf-${id}` } as never,
    );
    const lines = service.pdfLines({
      firm: {
        name: 'Saw Education LLP',
        gstin: '27AAPFU0939F1ZV',
        address: 'Pune',
        stateCode: '27',
      },
      school: { name: 'Demo Education Pvt Ltd', address: '1 MG Road, Pune', stateCode: '27' },
      invoiceNumber: 'SAW/2026-27/000007',
      issuedAt: new Date('2026-08-13T00:00:00.000Z'),
      kind: 'manual_activations',
      lineItems: [
        {
          description: 'Parent subscriptions collected in cash — 2026-27 (2 students)',
          quantity: 2,
          unitPaise: 36_500,
          amountPaise: 73_000,
        },
      ],
      split: { basePaise: 61_864, cgstPaise: 5_568, sgstPaise: 5_568, igstPaise: 0 },
      totalPaise: 73_000,
      placeOfSupply: '27 — Maharashtra',
      intraState: true,
    });
    const text = lines.join('\n');
    expect(text).toContain('2 students');
    expect(text).toContain('Demo Education Pvt Ltd');
    expect(text).not.toMatch(/\bAarav\b|\bPriya\b|\bSharma\b|\bguardian\b/i);
  });
});

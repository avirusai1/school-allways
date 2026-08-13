import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiException } from '../../common/errors/api.exception';
import { FeesService } from './fees.service';

describe('FeesService webhook & daybook', () => {
  const redis = {
    get: vi.fn(),
    set: vi.fn(),
  };

  const tx = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    execute: vi.fn(),
  };

  const db = {
    run: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    asTenant: vi.fn(async (_tid: string, fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  const queue = { enqueue: vi.fn() };
  const config = {
    get: vi.fn((key: string) => {
      if (key === 'NODE_ENV') return 'test';
      return undefined;
    }),
  };

  let service: FeesService;

  function selectChain(rows: unknown[]) {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.from = self;
    chain.innerJoin = self;
    chain.leftJoin = self;
    chain.where = self;
    chain.orderBy = self;
    chain.groupBy = self;
    chain.limit = () => Promise.resolve(rows);
    Object.assign(chain, {
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(rows).then(resolve, reject),
    });
    return chain;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FeesService(
      db as never,
      queue as never,
      config as never,
      redis as never,
    );
  });

  it('replays webhook keyed on gatewayPaymentId without double-settling', async () => {
    redis.get.mockResolvedValue(
      JSON.stringify({ tenantId: 'ten-1', paymentId: 'pay-1' }),
    );

    tx.select.mockImplementation(() =>
      selectChain([
        {
          id: 'pay-1',
          status: 'success',
          receiptNo: 'RCPT-000001',
          amountPaise: 1000,
          gatewayPaymentId: 'gw_1',
        },
      ]),
    );

    const first = await service.handleWebhook(
      {
        gatewayPaymentId: 'gw_1',
        gatewayOrderId: 'order_1',
        status: 'success',
        tenantId: 'ten-1',
      },
      '{}',
    );
    const second = await service.handleWebhook(
      {
        gatewayPaymentId: 'gw_1',
        gatewayOrderId: 'order_1',
        status: 'success',
        tenantId: 'ten-1',
      },
      '{}',
    );

    expect(first.replayed).toBe(true);
    expect(second.replayed).toBe(true);
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('blocks daybook close on unexplained variance', async () => {
    const { RequestContextStore, createEmptyContext } = await import(
      '../../common/context/request-context'
    );

    tx.select.mockImplementation(() => selectChain([{ mode: 'cash', total: 50_000 }]));

    await expect(
      RequestContextStore.run(
        {
          ...createEmptyContext('req-1'),
          tenantId: 'ten-1',
          branchId: 'br-1',
          userId: 'u-1',
        },
        () =>
          service.closeDaybook({
            day: '2026-04-10',
            countedClosingCashPaise: 40_000,
            cashDepositedPaise: 0,
          }),
      ),
    ).rejects.toBeInstanceOf(ApiException);

    try {
      await RequestContextStore.run(
        {
          ...createEmptyContext('req-2'),
          tenantId: 'ten-1',
          branchId: 'br-1',
          userId: 'u-1',
        },
        () =>
          service.closeDaybook({
            day: '2026-04-10',
            countedClosingCashPaise: 40_000,
            cashDepositedPaise: 0,
          }),
      );
    } catch (err) {
      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).code).toBe('VARIANCE_UNACKNOWLEDGED');
    }
  });

  it('a parent cannot read another family’s payment by id', async () => {
    const { ForbiddenException } = await import('@nestjs/common');
    const { RequestContextStore, createEmptyContext } = await import(
      '../../common/context/request-context'
    );

    tx.select.mockImplementation(() =>
      selectChain([
        {
          id: 'pay-other',
          studentId: 'child-99',
          receiptNo: 'R-1',
          paymentDate: '2026-04-01',
          amountPaise: 50000,
          mode: 'upi',
          status: 'success',
          referenceNo: 'ref',
          gatewayOrderId: 'ord_x',
          gatewayPaymentId: 'pay_x',
        },
      ]),
    );

    const grant = {
      code: 'fee.invoice.read',
      scope: 'self' as const,
      studentIds: ['child-1'],
    };

    await expect(
      RequestContextStore.run(
        {
          ...createEmptyContext('pay-idor'),
          tenantId: 'ten-1',
          branchId: 'br-1',
          userId: 'parent-1',
        },
        () => service.getPayment('pay-other', grant),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

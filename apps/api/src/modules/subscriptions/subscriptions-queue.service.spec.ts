import { describe, expect, it, vi } from 'vitest';

import { SubscriptionsQueueService } from './subscriptions-queue.service';

describe('SubscriptionsQueueService', () => {
  it('uses a deterministic jobId so two enqueues for one invoice share one job', async () => {
    const svc = new SubscriptionsQueueService({} as never);
    expect(svc.jobId('inv-1')).toBe('pinv-pdf-inv-1');

    const add = vi.fn().mockResolvedValue({});
    vi.spyOn(
      svc as unknown as { getQueue: () => { add: typeof add } },
      'getQueue',
    ).mockReturnValue({ add });

    const job = { invoiceId: 'inv-1', tenantId: 't-1' };
    const first = await svc.enqueue(job);
    const second = await svc.enqueue(job);

    expect(first.jobId).toBe('pinv-pdf-inv-1');
    expect(second.jobId).toBe('pinv-pdf-inv-1');
    expect(add).toHaveBeenCalledTimes(2);
    expect(add.mock.calls[0]?.[2]).toEqual({ jobId: 'pinv-pdf-inv-1' });
    expect(add.mock.calls[1]?.[2]).toEqual({ jobId: 'pinv-pdf-inv-1' });
    expect(add.mock.calls[0]?.[1]).toEqual({ invoiceId: 'inv-1', tenantId: 't-1' });
  });

  it('returns queued: false when Queue.add rejects, and does not throw', async () => {
    const svc = new SubscriptionsQueueService({} as never);
    vi.spyOn(
      svc as unknown as { getQueue: () => { add: () => Promise<never> } },
      'getQueue',
    ).mockReturnValue({
      add: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    });

    await expect(svc.enqueue({ invoiceId: 'inv-1', tenantId: 't-1' })).resolves.toEqual({
      jobId: 'pinv-pdf-inv-1',
      queued: false,
    });
  });
});

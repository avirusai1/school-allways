import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationService } from './notification.service';

describe('NotificationService.escalateUnread', () => {
  const config = {
    get: vi.fn((key: string) => {
      if (key === 'SMS_DAILY_CAP_PER_TENANT') return 2000;
      return undefined;
    }),
  };

  const redis = { duplicate: vi.fn(() => ({})) };

  let updateSet: Record<string, unknown> | null;
  let insertValues: Record<string, unknown> | null;
  let row: Record<string, unknown>;

  const tx = {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  };

  const db = {
    runUnscoped: vi.fn(),
    run: vi.fn(),
    asTenant: vi.fn(async (_tenantId: string, fn: (t: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };

  let service: NotificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    updateSet = null;
    insertValues = null;
    row = {
      id: 'att-1',
      tenantId: 't1',
      recipientUserId: 'u1',
      templateCode: 'STUDENT_ABSENT',
      priority: 'high',
      status: 'delivered',
      readAt: new Date(),
      announcementId: null,
      messageId: null,
      channel: 'push',
      attemptNo: 0,
    };

    // Chainable drizzle mocks.
    tx.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [row],
        }),
      }),
    });
    // count query path for smsUsedToday (only when not suppressed early)
    tx.update.mockImplementation(() => ({
      set: (set: Record<string, unknown>) => {
        updateSet = set;
        return {
          where: async () => undefined,
        };
      },
    }));
    tx.insert.mockImplementation(() => ({
      values: (v: Record<string, unknown>) => {
        insertValues = v;
        return Promise.resolve();
      },
    }));

    service = new NotificationService(config as never, db as never, redis as never);
  });

  it('suppresses SMS escalation when the push was already read', async () => {
    const result = await service.escalateUnread('t1', 'att-1');
    expect(result).toBe('suppressed');
    expect(updateSet).toEqual({ status: 'suppressed' });
    expect(insertValues).toBeNull();
  });

  it('skips when priority is below high', async () => {
    row.priority = 'normal';
    row.readAt = null;
    const result = await service.escalateUnread('t1', 'att-1');
    expect(result).toBe('skipped');
  });

  it('reads inside the tenant, since the ledger is invisible unscoped', async () => {
    await service.escalateUnread('t1', 'att-1');
    expect(db.asTenant).toHaveBeenCalledWith('t1', expect.any(Function));
    expect(db.runUnscoped).not.toHaveBeenCalled();
  });
});

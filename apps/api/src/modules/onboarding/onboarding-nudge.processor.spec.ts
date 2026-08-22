import { beforeEach, describe, expect, it, vi } from 'vitest';

// The processor builds a deep link from ADMIN_WEB_URL. It used to fall back to
// admin.school.techallways.com — a host that has never existed — so this
// dependency was invisible. It is required now, so the test declares it.
process.env.ADMIN_WEB_URL = 'https://school.example.com/admin';


import { OnboardingNudgeProcessor } from './onboarding-nudge.processor';

describe('OnboardingNudgeProcessor', () => {
  const db = {
    run: vi.fn(),
    asTenant: vi.fn(),
    runUnscoped: vi.fn(),
  };
  const notifications = { notify: vi.fn() };
  let processor: OnboardingNudgeProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    processor = new OnboardingNudgeProcessor(db as never, notifications as never);
  });

  it('sends a day-1 nudge for a school stalled > 24h', async () => {
    const stalledAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
    db.run.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        select: () => ({
          from: () => ({
            where: async () => [
              {
                id: 't1',
                name: 'Demo School',
                onboardingStep: 'import_staff',
                ownerPhone: '919876543210',
                updatedAt: stalledAt,
              },
            ],
          }),
        }),
      }),
    );

    db.asTenant.mockImplementation(async (_id: string, fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [],
            }),
          }),
        }),
        insert: () => ({ values: async () => undefined }),
      };
      return fn(tx);
    });

    db.runUnscoped.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [{ id: 'u1' }],
            }),
          }),
        }),
      }),
    );

    notifications.notify.mockResolvedValue({ queued: 1, deferred: false });

    const result = await processor.runDaily();
    expect(result.scanned).toBe(1);
    expect(result.sent).toBe(1);
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        templateCode: 'ONBOARDING_NUDGE',
        tenantId: 't1',
      }),
    );
  });

  it('does not nudge schools stalled under 24h', async () => {
    db.run.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        select: () => ({
          from: () => ({
            where: async () => [],
          }),
        }),
      }),
    );

    const result = await processor.runDaily();
    expect(result).toEqual({ scanned: 0, sent: 0 });
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});

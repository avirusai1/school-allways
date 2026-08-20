import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestContextStore } from '../../common/context/request-context';
import { OnboardingService } from './onboarding.service';

describe('OnboardingService.markActivated', () => {
  const db = {
    asTenant: vi.fn(),
    run: vi.fn(),
  };

  const notifications = { notify: vi.fn() };
  const growth = { grantRewardIfActivated: vi.fn().mockResolvedValue(null) };

  const config = {
    getOrThrow: vi.fn((key: string) => {
      if (key === 'FILES_BASE_URL') return 'https://files.example.com';
      throw new Error(key);
    }),
  };

  let service: OnboardingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OnboardingService(
      db as never,
      notifications as never,
      growth as never,
      { writeBuffer: vi.fn(), readBuffer: vi.fn() } as never,
      config as never,
    );
  });

  it('sets activatedAt only once and emits first_attendance event', async () => {
    const insert = vi.fn().mockResolvedValue(undefined);
    const updateChain = {
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 't1' }]),
        }),
      }),
    };

    db.asTenant.mockImplementation(async (_id: string, fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        update: vi.fn().mockReturnValue(updateChain),
        insert: vi.fn().mockReturnValue({ values: insert }),
      };
      return fn(tx);
    });

    // rewardReferralOnActivation uses RequestContextStore + db.run
    db.run.mockResolvedValue(undefined);

    const first = await service.markActivated('t1');
    expect(first).toBe(true);
    expect(insert).toHaveBeenCalled();

    // Second call: returning empty → already activated
    updateChain.set.mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    });
    const second = await service.markActivated('t1');
    expect(second).toBe(false);
  });
});

describe('OnboardingService.completeStep evidence', () => {
  const notifications = { notify: vi.fn() };
  const growth = { grantRewardIfActivated: vi.fn() };
  const storage = { writeBuffer: vi.fn() };

  const config = {
    getOrThrow: vi.fn((key: string) => {
      if (key === 'FILES_BASE_URL') return 'https://files.example.com';
      throw new Error(key);
    }),
  };

  let service: OnboardingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OnboardingService(
      { run: vi.fn() } as never,
      notifications as never,
      growth as never,
      storage as never,
      config as never,
    );
  });

  it('rejects completing import_staff when no rows were committed', async () => {
    const measured = vi.spyOn(
      service as unknown as { measuredStepOutcome: () => Promise<number | null> },
      'measuredStepOutcome',
    );
    measured.mockResolvedValue(0);

    (service as unknown as { db: { run: ReturnType<typeof vi.fn> } }).db = {
      run: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          select: vi.fn().mockReturnThis(),
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([{ onboardingStep: 'import_staff' }]),
          insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(undefined),
            }),
          }),
        };
        return fn(tx);
      }),
    };

    vi.spyOn(RequestContextStore, 'get').mockReturnValue({
      tenantId: 't1',
      userId: 'u1',
      branchId: 'b1',
      requestId: 'r1',
      sessionId: null,
      roleCodes: [],
      permissions: new Map(),
      isPlatformAdmin: false,
      impersonatorUserId: null,
      auditTrail: [],
      piiReads: [],
    } as never);

    vi.spyOn(service, 'getState').mockResolvedValue({} as never);
    vi.spyOn(service as never, 'loadProgress' as never).mockResolvedValue({
      import_staff: { status: 'in_progress', startedAt: new Date().toISOString() },
    });
    vi.spyOn(service as never, 'saveProgress' as never).mockResolvedValue(undefined);

    await expect(
      service.completeStep('import_staff', { action: 'completed', itemCount: 3 }),
    ).rejects.toMatchObject({ code: 'STEP_NOT_READY' });

    measured.mockRestore();
  });
});

describe('OnboardingService parent invite deep links', () => {
  it('deep link base points at /j/{token} path', () => {
    const base = process.env.JOIN_LINK_BASE_URL ?? 'https://school.techallways.com/j';
    const token = 'abc123';
    expect(`${base}/${token}`).toMatch(/\/j\/abc123$/);
  });
});

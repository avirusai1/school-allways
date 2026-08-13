import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from './auth.service';

describe('AuthService', () => {
  const repo = {
    findUserByPhone: vi.fn(),
    findMembership: vi.fn(),
    findBranch: vi.fn(),
    listActiveMemberships: vi.fn(),
    hasInvitedMembership: vi.fn(),
    updateSessionTenant: vi.fn(),
    updateUserLogin: vi.fn(),
  };

  const db = {
    runUnscoped: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    runAsActingUser: vi.fn(
      async (_userId: string, fn: (tx: unknown) => Promise<unknown>) => fn({}),
    ),
    asTenant: vi.fn(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => fn({})),
    run: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };

  const tokens = {
    signAccessToken: vi.fn(() => 'new-access-token'),
    accessExpiresIn: 900,
    rotateRefreshToken: vi.fn(),
    createSession: vi.fn(),
  };

  const otp = { verifyOtp: vi.fn(), requestOtp: vi.fn() };
  const session = { buildSession: vi.fn() };
  const config = {
    get: vi.fn((key: string) => (key === 'NODE_ENV' ? 'test' : undefined)),
    getOrThrow: vi.fn(() => 'https://files.example.com'),
  };

  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuthService(
      config as never,
      db as never,
      repo as never,
      otp as never,
      tokens as never,
      session as never,
    );
    vi.spyOn(service, 'onModuleInit').mockResolvedValue();
  });

  it('rejects select-tenant for non-members with TENANT_MISMATCH', async () => {
    repo.findMembership.mockResolvedValue(null);

    const ctxModule = await import('../../common/context/request-context');
    ctxModule.RequestContextStore.run(
      {
        requestId: 'req-1',
        userId: 'user-1',
        tenantId: null,
        branchId: null,
        sessionId: 'sess-1',
        roleCodes: [],
        permissions: new Map(),
        isPlatformAdmin: false,
        impersonatorUserId: null,
        auditTrail: [],
        piiReads: [],
      },
      async () => {
        await expect(
          service.selectTenant({ tenantId: 'tenant-foreign', branchId: 'branch-1' }),
        ).rejects.toMatchObject({ code: 'TENANT_MISMATCH' });
      },
    );
  });

  it('revokes all sessions when a reused refresh token is presented', async () => {
    tokens.rotateRefreshToken.mockRejectedValue(new Error('TOKEN_REUSE'));

    await expect(service.refresh('stolen-token')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('auto-scopes single-membership users', async () => {
    otp.verifyOtp.mockResolvedValue(undefined);
    repo.findUserByPhone.mockResolvedValue({
      id: 'user-1',
      fullName: 'Sunita Sharma',
      preferredLanguage: 'hi',
      kind: 'guardian',
      isMinor: false,
      isActive: true,
    });
    repo.listActiveMemberships.mockResolvedValue([
      {
        membershipId: 'm-1',
        tenantId: 'tenant-1',
        tenantName: 'DPS Rohini',
        tenantSlug: 'dps-rohini',
        tenantLogoPath: null,
        tenantStatus: 'active',
        branchId: 'branch-1',
        branchName: 'Main',
      },
    ]);
    tokens.createSession.mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresIn: 900,
      sessionId: 'sess-1',
    });

    const result = await service.verifyOtp({
      phone: '919876543210',
      code: '123456',
      purpose: 'login',
    });

    expect(result.requiresTenantSelection).toBe(false);
    expect(tokens.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', branchId: 'branch-1' }),
    );
  });

  it('refuses OTP login when the only membership is still invited', async () => {
    otp.verifyOtp.mockResolvedValue(undefined);
    repo.findUserByPhone.mockResolvedValue({
      id: 'user-invited',
      fullName: 'Parent of Meera',
      preferredLanguage: 'en',
      kind: 'guardian',
      isMinor: false,
      isActive: true,
    });
    repo.listActiveMemberships.mockResolvedValue([]);
    repo.hasInvitedMembership.mockResolvedValue(true);

    await expect(
      service.verifyOtp({
        phone: '919810000121',
        code: '123456',
        purpose: 'login',
      }),
    ).rejects.toMatchObject({
      code: 'INVITATION_PENDING',
    });
    expect(tokens.createSession).not.toHaveBeenCalled();
  });

  it('refuses OTP login when the account has no school membership at all', async () => {
    otp.verifyOtp.mockResolvedValue(undefined);
    repo.findUserByPhone.mockResolvedValue({
      id: 'user-orphan',
      fullName: 'Orphan Parent',
      preferredLanguage: 'en',
      kind: 'guardian',
      isMinor: false,
      isActive: true,
    });
    repo.listActiveMemberships.mockResolvedValue([]);
    repo.hasInvitedMembership.mockResolvedValue(false);

    await expect(
      service.verifyOtp({
        phone: '919800000001',
        code: '123456',
        purpose: 'login',
      }),
    ).rejects.toMatchObject({
      code: 'NO_SCHOOL_ACCESS',
    });
    expect(tokens.createSession).not.toHaveBeenCalled();
  });

  it('reassigns userId on the same FCM token rather than inserting a second row', async () => {
    const ctxModule = await import('../../common/context/request-context');
    const conflicts: Array<{ target: unknown; set: Record<string, unknown> }> = [];
    const inserts: Array<Record<string, unknown>> = [];

    db.run.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        insert: () => ({
          values: (v: Record<string, unknown>) => {
            inserts.push(v);
            return {
              onConflictDoUpdate: (opts: {
                target: unknown;
                set: Record<string, unknown>;
              }) => {
                conflicts.push(opts);
              },
            };
          },
        }),
      }),
    );

    const dto = {
      fcmToken: 'same-token-string-abcdefgh',
      platform: 'android' as const,
      appId: 'family' as const,
    };

    await ctxModule.RequestContextStore.run(
      {
        requestId: 'req-1',
        userId: 'user-a',
        tenantId: 'tenant-1',
        branchId: null,
        sessionId: 'sess-1',
        roleCodes: [],
        permissions: new Map(),
        isPlatformAdmin: false,
        impersonatorUserId: null,
        auditTrail: [],
        piiReads: [],
      },
      () => service.registerDeviceToken(dto),
    );

    await ctxModule.RequestContextStore.run(
      {
        requestId: 'req-2',
        userId: 'user-b',
        tenantId: 'tenant-2',
        branchId: null,
        sessionId: 'sess-2',
        roleCodes: [],
        permissions: new Map(),
        isPlatformAdmin: false,
        impersonatorUserId: null,
        auditTrail: [],
        piiReads: [],
      },
      () => service.registerDeviceToken(dto),
    );

    expect(inserts).toHaveLength(2);
    expect(conflicts).toHaveLength(2);
    // Conflict target is the token unique index, not the user — so a shared
    // handset reassigns ownership instead of duplicating the row.
    const { deviceTokens } = await import('@saw/db');
    expect(conflicts[0]!.target).toBe(deviceTokens.fcmToken);
    expect(conflicts[1]!.target).toBe(deviceTokens.fcmToken);
    expect(conflicts[1]!.set.userId).toBe('user-b');
    expect(conflicts[1]!.set.tenantId).toBe('tenant-2');
    expect(conflicts[1]!.set.isActive).toBe(true);
  });
});

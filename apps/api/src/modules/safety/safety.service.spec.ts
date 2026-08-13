import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiException } from '../../common/errors/api.exception';
import { SafetyService } from './safety.service';

describe('SafetyService', () => {
  const tx = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  };

  const db = {
    run: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  const config = {
    getOrThrow: vi.fn((key: string) => {
      if (key === 'FILES_BASE_URL') return 'https://files.example.com';
      if (key === 'JWT_ACCESS_SECRET') return 'secret-for-tests-0123456789abcdef';
      throw new Error(key);
    }),
  };

  const notifications = {
    notify: vi.fn().mockResolvedValue({ queued: 1, deferred: false }),
  };

  let service: SafetyService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SafetyService(db as never, config as never, notifications as never);
  });

  it('rejects full ID numbers — only last 4 characters', async () => {
    const { RequestContextStore, createEmptyContext } = await import(
      '../../common/context/request-context'
    );

    await expect(
      RequestContextStore.run(
        {
          ...createEmptyContext('r1'),
          tenantId: 'ten-1',
          branchId: 'br-1',
          userId: 'u-1',
        },
        () =>
          service.createVisitor({
            fullName: 'Vendor',
            idLast4: '12345',
          } as never),
      ),
    ).rejects.toMatchObject({ code: 'ID_LAST4_ONLY' } as Partial<ApiException>);
  });

  it('handover override requires ≥20 character reason', async () => {
    const { RequestContextStore, createEmptyContext } = await import(
      '../../common/context/request-context'
    );

    await expect(
      RequestContextStore.run(
        {
          ...createEmptyContext('r2'),
          tenantId: 'ten-1',
          branchId: 'br-1',
          userId: 'u-1',
        },
        () =>
          service.handover({
            studentId: '11111111-1111-1111-1111-111111111111',
            method: 'parent',
            verificationMethod: 'manual_override',
            overrideReason: 'too short',
          }),
      ),
    ).rejects.toMatchObject({
      code: 'OVERRIDE_REASON_REQUIRED',
    } as Partial<ApiException>);
  });

  it('authorised pickup requires a photo', async () => {
    const { RequestContextStore, createEmptyContext } = await import(
      '../../common/context/request-context'
    );

    const grant = {
      code: 'pickup.authorisation.manage',
      scope: 'branch' as const,
    };

    await expect(
      RequestContextStore.run(
        {
          ...createEmptyContext('r3'),
          tenantId: 'ten-1',
          branchId: 'br-1',
          userId: 'u-1',
        },
        () =>
          service.addAuthorised(
            {
              studentId: '11111111-1111-1111-1111-111111111111',
              fullName: 'Uncle',
              photoPath: '',
            },
            grant,
          ),
      ),
    ).rejects.toMatchObject({ code: 'PHOTO_REQUIRED' } as Partial<ApiException>);
  });

  it("a parent cannot revoke another family's authorised pickup", async () => {
    const { ForbiddenException } = await import('@nestjs/common');
    const { RequestContextStore, createEmptyContext } = await import(
      '../../common/context/request-context'
    );

    tx.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([
              { id: 'pickup-of-child-99', studentId: 'child-99' },
            ]),
        }),
      }),
    });

    const grant = {
      code: 'pickup.authorisation.manage',
      scope: 'self' as const,
      studentIds: ['child-1'],
    };

    await expect(
      RequestContextStore.run(
        {
          ...createEmptyContext('r-idor'),
          tenantId: 'ten-1',
          branchId: 'br-1',
          userId: 'parent-1',
        },
        () => service.revokeAuthorised('pickup-of-child-99', grant),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("a parent can revoke their own child's authorised pickup", async () => {
    const { RequestContextStore, createEmptyContext } = await import(
      '../../common/context/request-context'
    );

    tx.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([{ id: 'pickup-own', studentId: 'child-1' }]),
        }),
      }),
    });
    tx.update.mockReturnValue({
      set: () => ({
        where: () => ({
          returning: () =>
            Promise.resolve([{ id: 'pickup-own', revokedAt: new Date() }]),
        }),
      }),
    });

    const grant = {
      code: 'pickup.authorisation.manage',
      scope: 'self' as const,
      studentIds: ['child-1'],
    };

    const row = await RequestContextStore.run(
      {
        ...createEmptyContext('r-revoke-own'),
        tenantId: 'ten-1',
        branchId: 'br-1',
        userId: 'parent-1',
      },
      () => service.revokeAuthorised('pickup-own', grant),
    );

    expect(row).toMatchObject({ id: 'pickup-own' });
    expect(tx.update).toHaveBeenCalled();
  });

  it('revoking writes an audit entry', async () => {
    const { RequestContextStore, createEmptyContext } = await import(
      '../../common/context/request-context'
    );

    tx.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([{ id: 'pickup-audit', studentId: 'child-1' }]),
        }),
      }),
    });
    tx.update.mockReturnValue({
      set: () => ({
        where: () => ({
          returning: () =>
            Promise.resolve([{ id: 'pickup-audit', revokedAt: new Date() }]),
        }),
      }),
    });

    const grant = {
      code: 'pickup.authorisation.manage',
      scope: 'self' as const,
      studentIds: ['child-1'],
    };

    const ctx = await RequestContextStore.run(
      {
        ...createEmptyContext('r-audit'),
        tenantId: 'ten-1',
        branchId: 'br-1',
        userId: 'parent-1',
      },
      async () => {
        await service.revokeAuthorised('pickup-audit', grant);
        return RequestContextStore.get();
      },
    );

    expect(ctx.auditTrail).toContainEqual({
      action: 'pickup.authorisation.revoked',
      entityType: 'authorised_pickups',
      entityId: 'pickup-audit',
    });
  });
});

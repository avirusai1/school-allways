import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GrantedPermission } from '../../common/context/request-context';
import { StudentsService } from './students.service';

describe('StudentsService.list', () => {
  const repo = {
    list: vi.fn(),
    findCurrentSessionId: vi.fn().mockResolvedValue('session-1'),
    findById: vi.fn(),
    listGuardians: vi.fn(),
  };

  const db = {
    run: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };

  const config = { getOrThrow: vi.fn(() => 'https://files.example.com') };

  let service: StudentsService;

  const baseGrant: GrantedPermission = {
    code: 'student.record.read',
    scope: 'section',
    sectionIds: ['sec-5a'],
    subjectIds: [],
    studentIds: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new StudentsService(config as never, db as never, repo as never, {} as never);
  });

  it('returns only sections the class teacher is assigned to', async () => {
    repo.list.mockResolvedValue([
      {
        id: 's1',
        admissionNo: 'ADM-1',
        firstName: 'Aarav',
        middleName: null,
        lastName: 'Sharma',
        photoPath: null,
        gender: 'male',
        isRteStudent: false,
        rollNo: '1',
        status: 'active',
        sectionName: '5-A',
        className: 'V',
        attendancePercentageBp: 9200,
        sortValue: 'Aarav',
      },
    ]);

    const { RequestContextStore } = await import('../../common/context/request-context');
    const page = await RequestContextStore.run(
      {
        requestId: 'r1',
        userId: 'u1',
        tenantId: 't1',
        branchId: 'b1',
        sessionId: 'sess',
        roleCodes: [],
        permissions: new Map(),
        isPlatformAdmin: false,
        impersonatorUserId: null,
        auditTrail: [],
        piiReads: [],
      },
      () => service.list({ limit: 50 } as never, baseGrant),
    );

    expect(page.data.every((s) => s.sectionName === '5-A')).toBe(true);
    expect(repo.list).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ scopePredicate: expect.anything() }),
    );
  });

  it('returns NOTHING when a teacher has no sections assigned', async () => {
    repo.list.mockResolvedValue([]);
    const grant = { ...baseGrant, sectionIds: [] };

    const { RequestContextStore } = await import('../../common/context/request-context');
    const page = await RequestContextStore.run(
      {
        requestId: 'r1',
        userId: 'u1',
        tenantId: 't1',
        branchId: 'b1',
        sessionId: 'sess',
        roleCodes: [],
        permissions: new Map(),
        isPlatformAdmin: false,
        impersonatorUserId: null,
        auditTrail: [],
        piiReads: [],
      },
      () => service.list({ limit: 50 } as never, grant),
    );

    expect(page.data).toHaveLength(0);
  });

  it('throws SCOPE_VIOLATION for another family\'s child', async () => {
    repo.findById.mockResolvedValue({
      id: 'child-99',
      sectionId: 'sec-other',
      admissionNo: 'ADM-99',
      firstName: 'Other',
      middleName: null,
      lastName: 'Child',
      photoPath: null,
      gender: null,
      isRteStudent: false,
      rollNo: null,
      status: 'active',
      sectionName: null,
      className: null,
      attendancePercentageBp: null,
      dateOfBirth: null,
      bloodGroup: null,
      socialCategory: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      district: null,
      state: null,
      pincode: null,
      apaarId: null,
      apaarStatus: 'not_started',
      apaarGeneratedAt: null,
    });
    repo.listGuardians.mockResolvedValue([]);

    const grant = { ...baseGrant, scope: 'self' as const, studentIds: ['child-1'] };

    const { RequestContextStore } = await import('../../common/context/request-context');
    await expect(
      RequestContextStore.run(
        {
          requestId: 'r1',
          userId: 'u1',
          tenantId: 't1',
          branchId: 'b1',
          sessionId: 'sess',
          roleCodes: [],
          permissions: new Map(),
          isPlatformAdmin: false,
          impersonatorUserId: null,
          auditTrail: [],
          piiReads: [],
        },
        () => service.findOne('child-99', grant),
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});

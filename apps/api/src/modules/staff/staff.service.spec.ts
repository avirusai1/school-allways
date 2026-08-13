import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StaffService } from './staff.service';

describe('StaffService', () => {
  const repo = {
    findById: vi.fn(),
    hasSectionOverlap: vi.fn(),
    list: vi.fn(),
  };

  const db = {
    run: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };

  const config = {
    getOrThrow: vi.fn((key: string) => {
      if (key === 'FILES_BASE_URL') return 'https://files.example.com';
      throw new Error(key);
    }),
  };

  const permissions = { invalidate: vi.fn() };

  let service: StaffService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new StaffService(
      config as never,
      db as never,
      repo as never,
      permissions as never,
    );
  });

  it('a section-scoped teacher cannot read staff outside their sections', async () => {
    const { RequestContextStore, createEmptyContext } = await import(
      '../../common/context/request-context'
    );

    repo.findById.mockResolvedValue({
      id: 'staff-other',
      userId: 'u-other',
      employeeCode: 'T-99',
      firstName: 'Other',
      middleName: null,
      lastName: 'Teacher',
      designation: 'Teacher',
      photoPath: null,
      workPhone: '911111111111',
      workEmail: 'other@school.edu.in',
      personalPhone: '919999999999',
      isTeaching: true,
      status: 'active',
    });
    repo.hasSectionOverlap.mockResolvedValue(false);

    const grant = {
      code: 'staff.record.read',
      scope: 'section' as const,
      sectionIds: ['sec-a'],
    };

    await expect(
      RequestContextStore.run(
        {
          ...createEmptyContext('staff-scope'),
          tenantId: 'ten-1',
          branchId: 'br-1',
          userId: 'teacher-1',
        },
        () => service.findOne('staff-other', grant),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('findOne never returns personalPhone', async () => {
    const { RequestContextStore, createEmptyContext } = await import(
      '../../common/context/request-context'
    );

    repo.findById.mockResolvedValue({
      id: 'staff-1',
      userId: 'u-1',
      employeeCode: 'T-001',
      firstName: 'Priya',
      middleName: null,
      lastName: 'Menon',
      designation: 'Teacher',
      photoPath: null,
      workPhone: '911234567890',
      workEmail: 'priya@school.edu.in',
      personalPhone: '919876543210',
      isTeaching: true,
      status: 'active',
    });

    const grant = {
      code: 'staff.record.read',
      scope: 'branch' as const,
    };

    const dto = await RequestContextStore.run(
      {
        ...createEmptyContext('staff-phone'),
        tenantId: 'ten-1',
        branchId: 'br-1',
        userId: 'admin-1',
      },
      () => service.findOne('staff-1', grant),
    );

    expect(dto).not.toHaveProperty('personalPhone');
    expect(JSON.stringify(dto)).not.toContain('919876543210');
  });

  it('issueAccount returns a one-time password only when generated, never in the audit row', async () => {
    const { RequestContextStore, createEmptyContext } = await import(
      '../../common/context/request-context'
    );

    const auditInserts: unknown[] = [];
    const passwordUpdates: unknown[] = [];

    repo.findById.mockResolvedValue({
      id: 'staff-gen',
      userId: 'u-gen',
      employeeCode: 'T-GEN',
      firstName: 'Gen',
      middleName: null,
      lastName: 'Teacher',
      personalPhone: null,
      workPhone: null,
    });

    db.run.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => {
                // First select: emailTaken — empty. Second: membership — active.
                return [{ id: 'mem-1', status: 'active' }];
              },
            }),
          }),
        }),
        update: (_table: { name?: string } | unknown) => ({
          set: (values: Record<string, unknown>) => {
            if ('passwordHash' in values) passwordUpdates.push(values);
            return {
              where: async () => undefined,
            };
          },
        }),
        insert: () => ({
          values: (row: Record<string, unknown>) => {
            if (row.action === 'staff.account.issued') auditInserts.push(row);
            return Promise.resolve(undefined);
          },
        }),
      };
      // emailTaken query returns [] on first call — override select chain carefully
      let selectCalls = 0;
      tx.select = () => ({
        from: () => ({
          where: () => ({
            limit: async () => {
              selectCalls += 1;
              if (selectCalls === 1) return []; // email free
              return [{ id: 'mem-1', status: 'active' }];
            },
          }),
        }),
      });
      return fn(tx);
    });

    const result = await RequestContextStore.run(
      {
        ...createEmptyContext('issue-gen'),
        tenantId: 'ten-1',
        branchId: 'br-1',
        userId: 'admin-1',
      },
      () => service.issueAccount('staff-gen', { email: 'gen@example.com' }),
    );

    expect(result).toMatchObject({ userId: 'u-gen', email: 'gen@example.com' });
    expect(result).toHaveProperty('temporaryPassword');
    expect(typeof (result as { temporaryPassword?: string }).temporaryPassword).toBe('string');
    expect((result as { temporaryPassword: string }).temporaryPassword.length).toBeGreaterThanOrEqual(16);

    expect(auditInserts).toHaveLength(1);
    const changes = (auditInserts[0] as { changes: Record<string, unknown> }).changes;
    expect(changes).toEqual({
      email: { from: null, to: 'gen@example.com' },
      passwordGenerated: { from: false, to: true },
      userId: { from: null, to: 'u-gen' },
    });
    expect(JSON.stringify(auditInserts)).not.toContain(
      (result as { temporaryPassword: string }).temporaryPassword,
    );
    expect(JSON.stringify(passwordUpdates)).not.toContain(
      (result as { temporaryPassword: string }).temporaryPassword,
    );
    expect(passwordUpdates[0]).toMatchObject({
      email: 'gen@example.com',
      passwordHash: expect.stringMatching(/^\$argon2/),
    });
  });

  it('issueAccount omits temporaryPassword when the admin chose the password', async () => {
    const { RequestContextStore, createEmptyContext } = await import(
      '../../common/context/request-context'
    );

    repo.findById.mockResolvedValue({
      id: 'staff-chosen',
      userId: 'u-chosen',
      employeeCode: 'T-CH',
      firstName: 'Chosen',
      middleName: null,
      lastName: 'Teacher',
      personalPhone: null,
      workPhone: null,
    });

    db.run.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      let selectCalls = 0;
      const tx = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => {
                selectCalls += 1;
                if (selectCalls === 1) return [];
                return [{ id: 'mem-1', status: 'active' }];
              },
            }),
          }),
        }),
        update: () => ({
          set: () => ({
            where: async () => undefined,
          }),
        }),
        insert: () => ({
          values: () => Promise.resolve(undefined),
        }),
      };
      return fn(tx);
    });

    const result = await RequestContextStore.run(
      {
        ...createEmptyContext('issue-chosen'),
        tenantId: 'ten-1',
        branchId: 'br-1',
        userId: 'admin-1',
      },
      () =>
        service.issueAccount('staff-chosen', {
          email: 'chosen@example.com',
          password: 'ChosenPass1!',
        }),
    );

    expect(result).toEqual({ userId: 'u-chosen', email: 'chosen@example.com' });
    expect(result).not.toHaveProperty('temporaryPassword');
  });
});

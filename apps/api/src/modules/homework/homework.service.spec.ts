import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GrantedPermission } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { HomeworkService } from './homework.service';

describe('HomeworkService', () => {
  const insertedStubs: unknown[] = [];
  let enrollments: { studentId: string }[] = [];

  const tx = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  };

  const db = {
    run: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  let service: HomeworkService;

  const sectionGrant: GrantedPermission = {
    code: 'homework.manage',
    scope: 'section',
    sectionIds: ['sec-5a'],
    subjectIds: [],
    studentIds: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    insertedStubs.length = 0;
    enrollments = Array.from({ length: 40 }, (_, i) => ({ studentId: `st-${i}` }));

    tx.select.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.from = self;
      chain.where = self;
      chain.limit = async () => [{ id: 'staff-1' }];
      chain.orderBy = self;
      // First select after insert is roster; staff lookup uses limit.
      chain.then = undefined;
      return {
        from: () => ({
          where: (conds?: unknown) => {
            // Heuristic: enrollment roster has no limit chained in create().
            void conds;
            return {
              limit: async () => [{ id: 'staff-1' }],
              then: undefined,
              // Direct await of where() result for roster
              [Symbol.asyncIterator]: undefined,
            };
          },
        }),
      };
    });

    // Simpler: mock select to return different things based on call count.
    let selectCall = 0;
    tx.select.mockImplementation(() => {
      selectCall += 1;
      if (selectCall === 1) {
        // staff lookup
        return {
          from: () => ({
            where: () => ({
              limit: async () => [{ id: 'staff-1' }],
            }),
          }),
        };
      }
      // roster
      return {
        from: () => ({
          where: async () => enrollments,
        }),
      };
    });

    tx.insert.mockImplementation((_table: { [k: string]: unknown }) => ({
      values: (v: unknown) => {
        // homework insert returns returning(); stubs just resolve
        if (Array.isArray(v)) {
          insertedStubs.push(...v);
          return Promise.resolve();
        }
        return {
          returning: async () => [{ id: 'hw-1' }],
        };
      },
    }));

    service = new HomeworkService(db as never);
  });

  it('bulk-creates one submission stub per student in the section', async () => {
    const { RequestContextStore } = await import('../../common/context/request-context');
    const result = await RequestContextStore.run(
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
      () =>
        service.create(
          {
            sectionId: 'sec-5a',
            title: 'Maths worksheet',
            assignedOn: '2026-08-10',
          },
          sectionGrant,
        ),
    );

    expect(result).toEqual({ id: 'hw-1', stubCount: 40 });
    expect(insertedStubs).toHaveLength(40);
  });

  it('rejects homework for a section the teacher does not teach', async () => {
    const grant = { ...sectionGrant, sectionIds: ['sec-other'] };
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
        () =>
          service.create(
            {
              sectionId: 'sec-5a',
              title: 'Maths worksheet',
              assignedOn: '2026-08-10',
            },
            grant,
          ),
      ),
    ).rejects.toBeInstanceOf(ApiException);
  });

  it('parent feed loads multiple children in one query', async () => {
    const feedGrant: GrantedPermission = {
      code: 'homework.read',
      scope: 'self',
      sectionIds: [],
      subjectIds: [],
      studentIds: ['st-1', 'st-2', 'st-3'],
    };

    let whereArgs: unknown;
    const terminal = {
      orderBy: () => ({
        limit: async () => [],
      }),
    };
    // feed joins submissions → homework → students, then leftJoins subjects.
    const chain: Record<string, unknown> = {};
    chain.where = (...args: unknown[]) => {
      whereArgs = args;
      return terminal;
    };
    chain.leftJoin = () => chain;
    chain.innerJoin = () => chain;

    tx.select.mockReturnValue({
      from: () => chain,
    });

    await service.feed(['st-1', 'st-2', 'st-3'], feedGrant);
    expect(db.run).toHaveBeenCalledTimes(1);
    expect(whereArgs).toBeDefined();
  });
});

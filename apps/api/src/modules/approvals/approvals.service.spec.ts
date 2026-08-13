import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RequestContextStore,
  type GrantedPermission,
  type RequestContext,
} from '../../common/context/request-context';
import { ApprovalsService } from './approvals.service';

function ctxRun<T>(
  permissions: Array<[string, GrantedPermission]>,
  fn: () => T | Promise<T>,
  overrides: Partial<RequestContext> = {},
): T | Promise<T> {
  return RequestContextStore.run(
    {
      requestId: 'r1',
      userId: 'u1',
      tenantId: 't1',
      branchId: 'b1',
      sessionId: 'sess',
      roleCodes: ['principal'],
      permissions: new Map(permissions),
      isPlatformAdmin: false,
      impersonatorUserId: null,
      auditTrail: [],
      piiReads: [],
      ...overrides,
    },
    fn,
  );
}

const branchWide = (code: string): [string, GrantedPermission] => [
  code,
  { code, scope: 'branch' },
];

const sectionScoped = (
  code: string,
  sectionIds: string[],
): [string, GrantedPermission] => [code, { code, scope: 'section', sectionIds }];

describe('ApprovalsService', () => {
  const repo = {
    staffLeave: vi.fn(),
    studentLeave: vi.fn(),
    concessions: vi.fn(),
    circulars: vi.fn(),
    leaveTargets: vi.fn(),
    concessionTargets: vi.fn(),
    circularTargets: vi.fn(),
    decideLeave: vi.fn(),
    decideConcessions: vi.fn(),
    decideCirculars: vi.fn(),
  };

  const db = {
    run: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };

  let service: ApprovalsService;

  beforeEach(() => {
    vi.clearAllMocks();
    repo.staffLeave.mockResolvedValue([]);
    repo.studentLeave.mockResolvedValue([]);
    repo.concessions.mockResolvedValue([]);
    repo.circulars.mockResolvedValue([]);
    repo.decideLeave.mockResolvedValue(1);
    repo.decideConcessions.mockResolvedValue(1);
    repo.decideCirculars.mockResolvedValue(1);
    service = new ApprovalsService(db as never, repo as never);
  });

  describe('inbox', () => {
    it('hides staff leave from a section-scoped approver', async () => {
      const inbox = await ctxRun(
        [sectionScoped('leave.request.approve', ['sec-1'])],
        () => service.inbox(),
      );

      expect(repo.staffLeave).not.toHaveBeenCalled();
      expect(inbox.groups.find((g) => g.type === 'staff_leave')).toBeUndefined();
    });

    it('reads staff leave for a branch-wide approver', async () => {
      await ctxRun([branchWide('leave.request.approve')], () => service.inbox());

      expect(repo.staffLeave).toHaveBeenCalled();
    });

    it('shows an empty but visible group when the caller may act on it', async () => {
      const inbox = await ctxRun(
        [branchWide('fee.concession.approve')],
        () => service.inbox(),
      );

      const group = inbox.groups.find((g) => g.type === 'fee_concession');
      expect(group).toMatchObject({ count: 0, canDecide: true });
    });

    it('drops groups the caller can neither see nor decide', async () => {
      const inbox = await ctxRun([], () => service.inbox());

      expect(inbox.groups).toEqual([]);
      expect(inbox.total).toBe(0);
    });

    it('needs a branch before it can build a queue', async () => {
      await expect(
        ctxRun([branchWide('leave.request.approve')], () => service.inbox(), {
          branchId: null,
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('leaves paise unformatted for the client money formatter', async () => {
      repo.concessions.mockResolvedValue([
        {
          id: 'c1',
          type: 'staff_ward',
          percentageBp: null,
          flatAmountPaise: 250000,
          reason: 'Staff child',
          createdAt: new Date('2026-08-01T00:00:00Z'),
          studentId: 's1',
          firstName: 'Aditya',
          lastName: 'Reddy',
          sectionId: 'sec-1',
          sectionName: 'A',
          className: 'V',
        },
      ]);

      const inbox = await ctxRun(
        [branchWide('fee.concession.approve')],
        () => service.inbox(),
      );

      const item = inbox.groups.find((g) => g.type === 'fee_concession')!.items[0]!;
      expect(item.amountPaise).toBe(250000);
      expect(item.summary).toBe('staff ward');
      expect(item.detail).toBe('V-A');
    });
  });

  describe('decideLeave', () => {
    const grant: GrantedPermission = { code: 'leave.request.approve', scope: 'branch' };

    it('refuses a rejection with no reason', async () => {
      await expect(
        ctxRun([], () =>
          service.decideLeave({ ids: ['l1'], action: 'reject' }, grant),
        ),
      ).rejects.toMatchObject({ code: 'BUSINESS_RULE' });

      expect(repo.decideLeave).not.toHaveBeenCalled();
    });

    it('fails the whole batch when one row is not visible', async () => {
      repo.leaveTargets.mockResolvedValue([
        { id: 'l1', staffId: 'st1', studentId: null, status: 'pending', sectionId: null },
      ]);

      await expect(
        ctxRun([], () =>
          service.decideLeave({ ids: ['l1', 'l2'], action: 'approve' }, grant),
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });

      expect(repo.decideLeave).not.toHaveBeenCalled();
    });

    it('stops a section-scoped teacher approving a colleague', async () => {
      repo.leaveTargets.mockResolvedValue([
        { id: 'l1', staffId: 'st1', studentId: null, status: 'pending', sectionId: null },
      ]);

      await expect(
        ctxRun([], () =>
          service.decideLeave({ ids: ['l1'], action: 'approve' }, {
            code: 'leave.request.approve',
            scope: 'section',
            sectionIds: ['sec-1'],
          }),
        ),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('stops a section-scoped teacher approving another section', async () => {
      repo.leaveTargets.mockResolvedValue([
        { id: 'l1', staffId: null, studentId: 's1', status: 'pending', sectionId: 'sec-9' },
      ]);

      await expect(
        ctxRun([], () =>
          service.decideLeave({ ids: ['l1'], action: 'approve' }, {
            code: 'leave.request.approve',
            scope: 'section',
            sectionIds: ['sec-1'],
          }),
        ),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('lets a section-scoped teacher approve their own section', async () => {
      repo.leaveTargets.mockResolvedValue([
        { id: 'l1', staffId: null, studentId: 's1', status: 'pending', sectionId: 'sec-1' },
      ]);

      const result = await ctxRun([], () =>
        service.decideLeave({ ids: ['l1'], action: 'approve' }, {
          code: 'leave.request.approve',
          scope: 'section',
          sectionIds: ['sec-1'],
        }),
      );

      expect(result).toEqual({ decided: 1, requested: 1 });
    });

    it('reports a smaller decided count when someone else got there first', async () => {
      repo.leaveTargets.mockResolvedValue([
        { id: 'l1', staffId: 'st1', studentId: null, status: 'pending', sectionId: null },
        { id: 'l2', staffId: 'st2', studentId: null, status: 'approved', sectionId: null },
      ]);
      repo.decideLeave.mockResolvedValue(1);

      const result = await ctxRun([], () =>
        service.decideLeave({ ids: ['l1', 'l2'], action: 'approve' }, grant),
      );

      expect(result).toEqual({ decided: 1, requested: 2 });
    });

    it('writes one audit row per decided item', async () => {
      repo.leaveTargets.mockResolvedValue([
        { id: 'l1', staffId: 'st1', studentId: null, status: 'pending', sectionId: null },
        { id: 'l2', staffId: 'st2', studentId: null, status: 'pending', sectionId: null },
      ]);

      const trail: unknown[] = [];
      await ctxRun(
        [],
        () =>
          service.decideLeave(
            { ids: ['l1', 'l2'], action: 'reject', reason: 'Peak exam week' },
            grant,
          ),
        { auditTrail: trail as never },
      );

      expect(trail).toHaveLength(2);
      expect(trail[0]).toMatchObject({
        action: 'leave.request.rejected',
        entityId: 'l1',
      });
    });
  });
});

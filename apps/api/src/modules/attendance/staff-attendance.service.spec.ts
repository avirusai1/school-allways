import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RequestContextStore,
  type GrantedPermission,
  type RequestContext,
} from '../../common/context/request-context';
import {
  StaffAttendanceService,
  monthBounds,
  workedMinutes,
} from './staff-attendance.service';

const BRANCH = 'b1';

function ctxRun<T>(
  fn: () => T | Promise<T>,
  overrides: Partial<RequestContext> = {},
): T | Promise<T> {
  return RequestContextStore.run(
    {
      requestId: 'r1',
      userId: 'u1',
      tenantId: 't1',
      branchId: BRANCH,
      sessionId: 'sess',
      roleCodes: ['hr_manager'],
      permissions: new Map(),
      isPlatformAdmin: false,
      impersonatorUserId: null,
      auditTrail: [],
      piiReads: [],
      ...overrides,
    },
    fn,
  );
}

const branchGrant: GrantedPermission = {
  code: 'attendance.staff.mark',
  scope: 'branch',
};
const readGrant: GrantedPermission = {
  code: 'attendance.staff.read',
  scope: 'branch',
};
const sectionRead: GrantedPermission = {
  code: 'attendance.staff.read',
  scope: 'section',
  sectionIds: ['sec-1'],
};

describe('StaffAttendanceService', () => {
  const repo = {
    roster: vi.fn(),
    approvedLeaveOn: vi.fn(),
    branchStaffIds: vi.fn(),
    upsertMany: vi.fn(),
    findDay: vi.fn(),
    updateDay: vi.fn(),
    monthlySummary: vi.fn(),
    staffIdForUser: vi.fn(),
    branchOfStaff: vi.fn(),
  };

  const db = {
    run: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };

  let service: StaffAttendanceService;

  beforeEach(() => {
    vi.clearAllMocks();
    repo.roster.mockResolvedValue([]);
    repo.approvedLeaveOn.mockResolvedValue([]);
    repo.branchStaffIds.mockImplementation(
      async (_tx: unknown, _b: string, ids: string[]) => new Set(ids),
    );
    repo.upsertMany.mockResolvedValue(0);
    repo.monthlySummary.mockResolvedValue([]);
    service = new StaffAttendanceService(db as never, repo as never);
  });

  describe('roster', () => {
    it('returns the whole branch for a branch-scoped reader', async () => {
      repo.roster.mockResolvedValue([
        {
          staffId: 's1',
          employeeCode: 'E1',
          firstName: 'Rahul',
          lastName: 'Mehta',
          designation: 'Class Teacher',
          department: 'Primary',
          status: null,
          inTime: null,
          outTime: null,
          remarks: null,
        },
      ]);

      const out = await ctxRun(() => service.roster('2026-08-11', BRANCH, readGrant));

      expect(repo.roster).toHaveBeenCalledWith({}, BRANCH, '2026-08-11', undefined);
      expect(out.meta.isFullRoster).toBe(true);
      expect(out.rows[0]).toMatchObject({
        fullName: 'Rahul Mehta',
        status: 'not_marked',
      });
    });

    /**
     * Most teaching roles hold `attendance.staff.read` at section scope, and
     * staff have no section. Anything narrower than branch means "my own row".
     */
    it('narrows a section-scoped reader to their own record', async () => {
      repo.staffIdForUser.mockResolvedValue('my-staff-id');

      const out = await ctxRun(() =>
        service.roster('2026-08-11', BRANCH, sectionRead),
      );

      expect(repo.roster).toHaveBeenCalledWith(
        {},
        BRANCH,
        '2026-08-11',
        'my-staff-id',
      );
      expect(out.meta.isFullRoster).toBe(false);
    });

    it('refuses a narrow reader whose login has no staff record', async () => {
      repo.staffIdForUser.mockResolvedValue(null);

      await expect(
        ctxRun(() => service.roster('2026-08-11', BRANCH, sectionRead)),
      ).rejects.toMatchObject({ code: 'SCOPE_VIOLATION' });
    });

    it('flags people whose approved leave covers the day', async () => {
      repo.roster.mockResolvedValue([
        {
          staffId: 's1',
          employeeCode: 'E1',
          firstName: 'Rahul',
          lastName: null,
          designation: null,
          department: null,
          status: null,
          inTime: null,
          outTime: null,
          remarks: null,
        },
      ]);
      repo.approvedLeaveOn.mockResolvedValue([{ staffId: 's1', id: 'lr-1' }]);

      const out = await ctxRun(() => service.roster('2026-08-11', BRANCH, readGrant));

      expect(out.rows[0]!.onApprovedLeave).toBe(true);
    });

    it('refuses to read another branch on a branch-scoped grant', async () => {
      await expect(
        ctxRun(() => service.roster('2026-08-11', 'other-branch', readGrant)),
      ).rejects.toMatchObject({ code: 'SCOPE_VIOLATION' });
    });
  });

  describe('mark', () => {
    const dto = {
      branchId: BRANCH,
      day: '2026-08-11',
      entries: [
        { staffId: 's1', status: 'present' as const },
        { staffId: 's2', status: 'absent' as const },
      ],
    };

    it('writes the whole roster in one statement', async () => {
      await ctxRun(() => service.mark(dto, branchGrant));

      expect(repo.upsertMany).toHaveBeenCalledTimes(1);
      expect(repo.upsertMany.mock.calls[0]![1]).toHaveLength(2);
    });

    it('takes the marker from context, never the request', async () => {
      await ctxRun(() =>
        service.mark(
          { ...dto, ...({ markedByUserId: 'somebody-else' } as object) },
          branchGrant,
        ),
      );

      const rows = repo.upsertMany.mock.calls[0]![1] as Array<{
        markedByUserId: string;
      }>;
      expect(rows.every((r) => r.markedByUserId === 'u1')).toBe(true);
    });

    it('rejects a register containing someone from another branch', async () => {
      repo.branchStaffIds.mockResolvedValue(new Set(['s1']));

      await expect(ctxRun(() => service.mark(dto, branchGrant))).rejects.toMatchObject(
        { code: 'BUSINESS_RULE' },
      );
      expect(repo.upsertMany).not.toHaveBeenCalled();
    });

    it('rejects the same person twice in one register', async () => {
      await expect(
        ctxRun(() =>
          service.mark(
            {
              ...dto,
              entries: [
                { staffId: 's1', status: 'present' as const },
                { staffId: 's1', status: 'absent' as const },
              ],
            },
            branchGrant,
          ),
        ),
      ).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
    });

    it('refuses to mark a branch the caller is not signed in to', async () => {
      await expect(
        ctxRun(() => service.mark({ ...dto, branchId: 'other' }, branchGrant)),
      ).rejects.toMatchObject({ code: 'SCOPE_VIOLATION' });
    });

    it('links an on_leave mark to the approval that explains it', async () => {
      repo.approvedLeaveOn.mockResolvedValue([{ staffId: 's2', id: 'lr-9' }]);

      await ctxRun(() =>
        service.mark(
          {
            ...dto,
            entries: [
              { staffId: 's1', status: 'present' as const },
              { staffId: 's2', status: 'on_leave' as const },
            ],
          },
          branchGrant,
        ),
      );

      const rows = repo.upsertMany.mock.calls[0]![1] as Array<{
        staffId: string;
        leaveRequestId: string | null;
      }>;
      expect(rows.find((r) => r.staffId === 's2')!.leaveRequestId).toBe('lr-9');
      expect(rows.find((r) => r.staffId === 's1')!.leaveRequestId).toBeNull();
    });

    it('counts what it wrote', async () => {
      const out = await ctxRun(() =>
        service.mark(
          {
            ...dto,
            entries: [
              { staffId: 's1', status: 'present' as const },
              { staffId: 's2', status: 'late' as const },
              { staffId: 's3', status: 'absent' as const },
              { staffId: 's4', status: 'on_leave' as const },
            ],
          },
          branchGrant,
        ),
      );

      expect(out).toMatchObject({ total: 4, present: 1, late: 1, absent: 1, onLeave: 1 });
    });
  });

  describe('amend', () => {
    it('refuses an empty patch rather than writing a no-op', async () => {
      await expect(
        ctxRun(() => service.amend('s1', '2026-08-11', {}, branchGrant)),
      ).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
    });

    it('will not invent a row for a day nobody marked', async () => {
      repo.findDay.mockResolvedValue(null);

      await expect(
        ctxRun(() =>
          service.amend('s1', '2026-08-11', { status: 'late' }, branchGrant),
        ),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('guards against the branch on the row, not the caller’s claim', async () => {
      repo.findDay.mockResolvedValue({
        id: 'row-1',
        branchId: 'a-different-branch',
        status: 'present',
        inTime: null,
        outTime: null,
        remarks: null,
      });

      await expect(
        ctxRun(() =>
          service.amend('s1', '2026-08-11', { status: 'late' }, branchGrant),
        ),
      ).rejects.toMatchObject({ code: 'SCOPE_VIOLATION' });
    });

    it('recomputes the shift length when only one end moves', async () => {
      repo.findDay.mockResolvedValue({
        id: 'row-1',
        branchId: BRANCH,
        status: 'present',
        inTime: '09:00',
        outTime: null,
        remarks: null,
      });
      repo.updateDay.mockResolvedValue({ id: 'row-1', status: 'half_day' });

      await ctxRun(() =>
        service.amend(
          's1',
          '2026-08-11',
          { status: 'half_day', outTime: '11:30' },
          branchGrant,
        ),
      );

      expect(repo.updateDay.mock.calls[0]![2]).toMatchObject({
        workedMinutes: 150,
        markedByUserId: 'u1',
      });
    });
  });

  describe('summary', () => {
    it('lets a narrow reader see only themselves', async () => {
      repo.staffIdForUser.mockResolvedValue('me');

      await expect(
        ctxRun(() => service.summary('someone-else', '2026-08', sectionRead)),
      ).rejects.toMatchObject({ code: 'SCOPE_VIOLATION' });
    });

    it('totals a month by status', async () => {
      repo.branchOfStaff.mockResolvedValue(BRANCH);
      repo.monthlySummary.mockResolvedValue([
        { status: 'present', days: 18, minutes: 8640 },
        { status: 'absent', days: 2, minutes: 0 },
        { status: 'on_leave', days: 1, minutes: 0 },
      ]);

      const out = await ctxRun(() => service.summary('s1', '2026-08', readGrant));

      expect(out).toMatchObject({
        present: 18,
        absent: 2,
        onLeave: 1,
        markedDays: 21,
        workedMinutes: 8640,
      });
    });
  });
});

describe('workedMinutes', () => {
  it('measures a normal shift', () => {
    expect(workedMinutes('09:00', '16:30')).toBe(450);
  });

  it('has no length until both ends are known', () => {
    expect(workedMinutes('09:00', null)).toBeNull();
    expect(workedMinutes(null, '16:30')).toBeNull();
  });

  it('refuses a negative shift rather than poisoning a payroll sum', () => {
    expect(workedMinutes('16:30', '09:00')).toBeNull();
  });
});

describe('monthBounds', () => {
  it('ends on the last day of a 31-day month', () => {
    expect(monthBounds('2026-08')).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });

  it('handles February in a leap year', () => {
    expect(monthBounds('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('handles February in a common year', () => {
    expect(monthBounds('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
});

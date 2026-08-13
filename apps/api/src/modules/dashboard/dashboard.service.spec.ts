import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestContextStore } from '../../common/context/request-context';
import { DashboardService } from './dashboard.service';

function ctxRun<T>(fn: () => T | Promise<T>): T | Promise<T> {
  return RequestContextStore.run(
    {
      requestId: 'r1',
      userId: 'u1',
      tenantId: 't1',
      branchId: 'b1',
      sessionId: 'sess',
      roleCodes: ['principal'],
      permissions: new Map(),
      isPlatformAdmin: false,
      impersonatorUserId: null,
      auditTrail: [],
      piiReads: [],
    },
    fn,
  );
}

describe('DashboardService', () => {
  const repo = {
    currentSessionId: vi.fn(),
    attendanceToday: vi.fn(),
    sectionCount: vi.fn(),
    unmarkedSections: vi.fn(),
    staffToday: vi.fn(),
    activeStaffCount: vi.fn(),
    collections: vi.fn(),
    pendingApprovals: vi.fn(),
    openIncidents: vi.fn(),
  };

  const db = {
    run: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };

  let service: DashboardService;

  beforeEach(() => {
    vi.clearAllMocks();
    repo.currentSessionId.mockResolvedValue('sess-1');
    repo.attendanceToday.mockResolvedValue({
      present: 1412,
      total: 1498,
      markedSections: 24,
    });
    repo.sectionCount.mockResolvedValue(30);
    repo.unmarkedSections.mockResolvedValue([
      { sectionId: 'sec-1', sectionName: 'A', className: 'V', teacherFirstName: 'Priya', teacherLastName: 'Menon' },
    ]);
    repo.staffToday.mockResolvedValue({ present: 62, marked: 68 });
    repo.activeStaffCount.mockResolvedValue(68);
    repo.collections.mockResolvedValue([]);
    repo.pendingApprovals.mockResolvedValue({
      staffLeave: 3,
      studentLeave: 1,
      feeConcession: 2,
      circular: 0,
    });
    repo.openIncidents.mockResolvedValue([]);
    service = new DashboardService(db as never, repo as never);
  });

  it('reports attendance in basis points so the client rounds once', async () => {
    const d = await ctxRun(() => service.principal('2026-08-11', 'b1'));
    // 1412/1498 = 94.259…%
    expect(d.attendance.percentageBp).toBe(9426);
  });

  it('does not divide by zero before the first register of the day', async () => {
    repo.attendanceToday.mockResolvedValue({ present: 0, total: 0, markedSections: 0 });

    const d = await ctxRun(() => service.principal('2026-08-11', 'b1'));

    expect(d.attendance.percentageBp).toBe(0);
    expect(d.attendance.total).toBe(0);
  });

  it('skips the unmarked lookup once every section has been marked', async () => {
    repo.attendanceToday.mockResolvedValue({
      present: 1498,
      total: 1498,
      markedSections: 30,
    });

    const d = await ctxRun(() => service.principal('2026-08-11', 'b1'));

    expect(repo.unmarkedSections).not.toHaveBeenCalled();
    expect(d.unmarkedSections).toEqual([]);
  });

  it('pads days with no takings so the sparkline has no gaps', async () => {
    repo.collections.mockResolvedValue([
      { day: '2026-08-10', amountPaise: '125000' },
      { day: '2026-08-11', amountPaise: '40000' },
    ]);

    const d = await ctxRun(() => service.principal('2026-08-11', 'b1'));

    expect(d.collections.series).toHaveLength(14);
    expect(d.collections.series[0]).toEqual({ day: '2026-07-29', amountPaise: 0 });
    expect(d.collections.series.at(-1)).toEqual({
      day: '2026-08-11',
      amountPaise: 40000,
    });
    // The tile and the last point of the chart are the same number by
    // construction, so they cannot drift apart.
    expect(d.collections.todayPaise).toBe(40000);
  });

  it('counts incidents and approvals together as open items', async () => {
    repo.openIncidents.mockResolvedValue([
      { id: 'i1', title: 'Playground fall', category: 'injury', severity: 'low', occurredAt: new Date('2026-08-11T04:00:00Z') },
      { id: 'i2', title: 'Gate left open', category: 'security', severity: 'medium', occurredAt: null },
    ]);

    const d = await ctxRun(() => service.principal('2026-08-11', 'b1'));

    expect(d.openItems.total).toBe(8);
    expect(d.openItems.incidents).toBe(2);
    expect(d.incidents[0]!.occurredAt).toBe('2026-08-11T04:00:00.000Z');
    expect(d.incidents[1]!.occurredAt).toBeNull();
  });

  it('reports no session rather than a wall of zeroes', async () => {
    repo.currentSessionId.mockResolvedValue(null);

    const d = await ctxRun(() => service.principal('2026-08-11', 'b1'));

    expect(d.academicSessionId).toBeNull();
    expect(d.attendance.totalSections).toBe(0);
    expect(repo.sectionCount).not.toHaveBeenCalled();
  });

  it('refuses to guess a branch when the session has none', async () => {
    await expect(
      RequestContextStore.run(
        {
          requestId: 'r1',
          userId: 'u1',
          tenantId: 't1',
          branchId: null,
          sessionId: 'sess',
          roleCodes: [],
          permissions: new Map(),
          isPlatformAdmin: false,
          impersonatorUserId: null,
          auditTrail: [],
          piiReads: [],
        },
        () => service.principal('2026-08-11', undefined),
      ),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('separates staff marked from staff present, so an unmarked day is visible', async () => {
    repo.staffToday.mockResolvedValue({ present: 0, marked: 0 });

    const d = await ctxRun(() => service.principal('2026-08-11', 'b1'));

    expect(d.staff).toEqual({ present: 0, total: 68, marked: 0 });
  });
});

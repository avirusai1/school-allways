import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GrantedPermission } from '../../common/context/request-context';
import { RequestContextStore } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { AttendanceService } from './attendance.service';

function ctxRun<T>(fn: () => T | Promise<T>): T | Promise<T> {
  return RequestContextStore.run(
    {
      requestId: 'r1',
      userId: 'u1',
      tenantId: 't1',
      branchId: 'b1',
      sessionId: 'sess',
      roleCodes: ['class_teacher'],
      permissions: new Map(),
      isPlatformAdmin: false,
      impersonatorUserId: null,
      auditTrail: [],
      piiReads: [],
    },
    fn,
  );
}

describe('AttendanceService', () => {
  const repo = {
    findRegisterByMutationId: vi.fn(),
    findSession: vi.fn(),
    getSectionLabel: vi.fn(),
    findRegister: vi.fn(),
    findCalendarDay: vi.fn(),
    enrollmentMap: vi.fn(),
    findStaffIdForUser: vi.fn(),
    insertRegister: vi.fn(),
    bulkInsertEntries: vi.fn(),
    listEntries: vi.fn(),
    findRegisterById: vi.fn(),
    updateEntry: vi.fn(),
    updateRegisterCounts: vi.fn(),
  };

  const db = {
    run: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };

  const queue = {
    enqueueAbsenteeAlerts: vi.fn().mockResolvedValue(2),
  };

  const config = { getOrThrow: vi.fn(() => 'https://files.example.com') };
  const onboarding = { markActivated: vi.fn().mockResolvedValue(true) };

  let service: AttendanceService;

  const sectionGrant: GrantedPermission = {
    code: 'attendance.student.mark',
    scope: 'section',
    sectionIds: ['sec-5a'],
    subjectIds: [],
    studentIds: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AttendanceService(
      config as never,
      db as never,
      repo as never,
      queue as never,
      onboarding as never,
    );
  });

  it('rejects marking a section outside the teacher scope with SCOPE_VIOLATION', async () => {
    await expect(
      ctxRun(() =>
        service.mark(
          {
            sectionId: 'sec-other',
            academicSessionId: 'sess-1',
            day: '2026-08-10',
            mode: 'daily',
            entries: [{ studentId: 's1', status: 'present' }],
          },
          sectionGrant,
        ),
      ),
    ).rejects.toMatchObject({ code: 'SCOPE_VIOLATION' });
  });

  it('returns ALREADY_MARKED when the register is locked', async () => {
    repo.findRegisterByMutationId.mockResolvedValue(null);
    repo.findSession.mockResolvedValue({ id: 'sess-1', isLocked: false, branchId: 'b1' });
    repo.getSectionLabel.mockResolvedValue({
      sectionId: 'sec-5a',
      sectionName: 'A',
      className: 'V',
      branchId: 'b1',
      academicSessionId: 'sess-1',
      classTeacherStaffId: null,
    });
    repo.findRegister.mockResolvedValue({
      id: 'reg-1',
      isLocked: true,
      sectionId: 'sec-5a',
    });

    await expect(
      ctxRun(() =>
        service.mark(
          {
            sectionId: 'sec-5a',
            academicSessionId: 'sess-1',
            day: '2026-08-10',
            mode: 'daily',
            entries: [{ studentId: 's1', status: 'present' }],
          },
          sectionGrant,
          'mut-1',
        ),
      ),
    ).rejects.toMatchObject({ code: 'ALREADY_MARKED' });
  });

  it('rejects holiday marking without force', async () => {
    repo.findRegisterByMutationId.mockResolvedValue(null);
    repo.findSession.mockResolvedValue({ id: 'sess-1', isLocked: false, branchId: 'b1' });
    repo.getSectionLabel.mockResolvedValue({
      sectionId: 'sec-5a',
      sectionName: 'A',
      className: 'V',
      branchId: 'b1',
      academicSessionId: 'sess-1',
      classTeacherStaffId: null,
    });
    repo.findRegister.mockResolvedValue(null);
    repo.findCalendarDay.mockResolvedValue({
      dayType: 'holiday',
      title: 'Independence Day',
    });

    await expect(
      ctxRun(() =>
        service.mark(
          {
            sectionId: 'sec-5a',
            academicSessionId: 'sess-1',
            day: '2026-08-15',
            mode: 'daily',
            entries: [{ studentId: 's1', status: 'present' }],
          },
          sectionGrant,
        ),
      ),
    ).rejects.toBeInstanceOf(ApiException);
  });

  it('replays the same mutation id without creating a second register', async () => {
    repo.findRegisterByMutationId.mockResolvedValue({
      id: 'reg-1',
      day: '2026-08-10',
      sectionId: 'sec-5a',
      presentCount: 38,
      absentCount: 2,
      totalCount: 40,
      markedAt: new Date('2026-08-10T02:45:00Z'),
    });
    repo.getSectionLabel.mockResolvedValue({
      sectionId: 'sec-5a',
      sectionName: 'A',
      className: 'V',
      branchId: 'b1',
      academicSessionId: 'sess-1',
      classTeacherStaffId: null,
    });
    repo.listEntries.mockResolvedValue([
      { studentId: 's1', status: 'present' },
      { studentId: 's2', status: 'late' },
    ]);

    const result = await ctxRun(() =>
      service.mark(
        {
          sectionId: 'sec-5a',
          academicSessionId: 'sess-1',
          day: '2026-08-10',
          mode: 'daily',
          entries: [{ studentId: 's1', status: 'present' }],
        },
        sectionGrant,
        'mut-replay',
      ),
    );

    expect(result.registerId).toBe('reg-1');
    expect(repo.insertRegister).not.toHaveBeenCalled();
    expect(result.lateCount).toBe(1);
  });

  it('rejects empty section scope (teacher with no sections)', async () => {
    const emptyGrant: GrantedPermission = {
      ...sectionGrant,
      sectionIds: [],
    };

    await expect(
      ctxRun(() =>
        service.mark(
          {
            sectionId: 'sec-5a',
            academicSessionId: 'sess-1',
            day: '2026-08-10',
            mode: 'daily',
            entries: [{ studentId: 's1', status: 'present' }],
          },
          emptyGrant,
        ),
      ),
    ).rejects.toMatchObject({ code: 'SCOPE_VIOLATION' });
  });
});

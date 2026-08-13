import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  RequestContextStore,
  type GrantedPermission,
} from '../../common/context/request-context';
import { TenantDbService } from '../../common/database/tenant-db.service';
import { ApiException } from '../../common/errors/api.exception';
import { assertInScope } from '../../common/rbac/scope.util';
import { publicFileUrl } from '../../common/utils/url.util';
import { AttendanceQueueService } from './attendance-queue.service';
import { AttendanceRepository } from './attendance.repository';
import type {
  AmendAttendanceDto,
  MarkAttendanceDto,
} from './dto/mark-attendance.dto';
import type {
  AttendanceSummaryDto,
  MarkAttendanceResponseDto,
  PendingSectionDto,
  RosterResponseDto,
} from './dto/attendance.response';
import { OnboardingService } from '../onboarding/onboarding.service';

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly db: TenantDbService,
    private readonly repo: AttendanceRepository,
    private readonly queue: AttendanceQueueService,
    private readonly onboarding: OnboardingService,
  ) {}

  async getRoster(
    sectionId: string,
    day: string,
    periodId: string | null,
    grant: GrantedPermission,
  ): Promise<RosterResponseDto> {
    this.assertSectionScope(grant, sectionId);

    const filesBaseUrl = this.config.getOrThrow<string>('FILES_BASE_URL');

    return this.db.run(async (tx) => {
      const section = await this.repo.getSectionLabel(tx, sectionId);
      if (!section) throw new NotFoundException('Section not found');

      const register = await this.repo.findRegister(tx, sectionId, day, periodId);
      const calendar = await this.repo.findCalendarDay(
        tx,
        section.academicSessionId,
        day,
      );

      const roster = await this.repo.loadRoster(tx, {
        sectionId,
        academicSessionId: section.academicSessionId,
        day,
        registerId: register?.id ?? null,
      });

      const markedByName = register
        ? await this.repo.staffName(tx, register.markedByStaffId)
        : null;

      const isHoliday =
        !!calendar && calendar.dayType !== 'working' && calendar.dayType !== 'half_day';

      return {
        register: {
          id: register?.id ?? null,
          sectionId,
          sectionLabel: `${section.className}-${section.sectionName}`,
          academicSessionId: section.academicSessionId,
          day,
          periodId: register?.periodId ?? periodId,
          mode: register?.mode ?? 'daily',
          isLocked: register?.isLocked ?? false,
          markedAt: register?.markedAt?.toISOString() ?? null,
          markedByName,
        },
        students: roster.map((s) => ({
          studentId: s.studentId,
          rollNo: s.rollNo,
          fullName: [s.firstName, s.middleName, s.lastName].filter(Boolean).join(' '),
          photoUrl: publicFileUrl(filesBaseUrl, s.photoPath),
          status: s.attendanceStatus ?? 'not_marked',
          onApprovedLeave: !!s.leaveRequestId,
          remarks: s.remarks,
        })),
        meta: {
          total: roster.length,
          isHoliday,
          holidayTitle: isHoliday ? (calendar?.title ?? null) : null,
        },
      };
    });
  }

  async mark(
    dto: MarkAttendanceDto,
    grant: GrantedPermission,
    mutationId?: string,
  ): Promise<MarkAttendanceResponseDto> {
    this.assertSectionScope(grant, dto.sectionId);

    const ctx = RequestContextStore.get();
    const periodId = dto.periodId ?? null;

    // Idempotent offline replay: same mutation id → same response.
    if (mutationId) {
      const existing = await this.db.run((tx) =>
        this.repo.findRegisterByMutationId(tx, mutationId),
      );
      if (existing) {
        const section = await this.db.run((tx) =>
          this.repo.getSectionLabel(tx, existing.sectionId),
        );
        const entries = await this.db.run((tx) =>
          this.repo.listEntries(tx, existing.id),
        );
        const lateCount = entries.filter((e) => e.status === 'late').length;
        return {
          registerId: existing.id,
          day: existing.day,
          sectionLabel: section
            ? `${section.className}-${section.sectionName}`
            : '',
          presentCount: existing.presentCount,
          absentCount: existing.absentCount,
          lateCount,
          totalCount: existing.totalCount,
          markedAt: existing.markedAt?.toISOString() ?? new Date().toISOString(),
          alertsQueued: 0,
        };
      }
    }

    const result = await this.db.run(async (tx) => {
      const session = await this.repo.findSession(tx, dto.academicSessionId);
      if (!session) throw new NotFoundException('Academic session not found');
      if (session.isLocked) {
        throw new ApiException(
          409,
          'SESSION_LOCKED',
          'This academic session is locked. Attendance cannot be changed.',
        );
      }

      const section = await this.repo.getSectionLabel(tx, dto.sectionId);
      if (!section) throw new NotFoundException('Section not found');

      const existing = await this.repo.findRegister(
        tx,
        dto.sectionId,
        dto.day,
        periodId,
      );
      if (existing?.isLocked) {
        throw new ApiException(
          409,
          'ALREADY_MARKED',
          'Attendance for this class is already marked. Use amend to correct it.',
          { registerId: existing.id },
        );
      }

      const calendar = await this.repo.findCalendarDay(
        tx,
        dto.academicSessionId,
        dto.day,
      );
      const isHoliday =
        !!calendar && calendar.dayType !== 'working' && calendar.dayType !== 'half_day';
      if (isHoliday && !dto.force) {
        throw new ApiException(
          422,
          'BUSINESS_RULE',
          `${dto.day} is marked as a holiday${calendar?.title ? ` (${calendar.title})` : ''}. ` +
            `Pass force=true if you still need to mark attendance.`,
        );
      }

      const studentIds = dto.entries.map((e) => e.studentId);
      const enrollments = await this.repo.enrollmentMap(
        tx,
        dto.sectionId,
        dto.academicSessionId,
        studentIds,
      );

      const missing = studentIds.filter((id) => !enrollments.has(id));
      if (missing.length) {
        throw new ApiException(
          422,
          'BUSINESS_RULE',
          'One or more students are not enrolled in this section for this session.',
          { studentIds: missing },
        );
      }

      const presentCount = dto.entries.filter((e) =>
        ['present', 'late'].includes(e.status),
      ).length;
      const absentCount = dto.entries.filter((e) => e.status === 'absent').length;
      const lateCount = dto.entries.filter((e) => e.status === 'late').length;

      const staffId = ctx.userId
        ? await this.repo.findStaffIdForUser(tx, ctx.userId)
        : null;

      const register = await this.repo.insertRegister(tx, {
        tenantId: ctx.tenantId!,
        branchId: section.branchId,
        academicSessionId: dto.academicSessionId,
        sectionId: dto.sectionId,
        day: dto.day,
        periodId,
        subjectId: dto.subjectId ?? null,
        mode: dto.mode,
        markedByStaffId: staffId,
        clientMutationId: mutationId ?? null,
        presentCount,
        absentCount,
        totalCount: dto.entries.length,
        createdBy: ctx.userId,
      });

      await this.repo.bulkInsertEntries(
        tx,
        dto.entries.map((e) => ({
          tenantId: ctx.tenantId!,
          registerId: register.id,
          studentId: e.studentId,
          enrollmentId: enrollments.get(e.studentId) ?? null,
          day: dto.day,
          sectionId: dto.sectionId,
          status: e.status,
          inTime: e.inTime ?? null,
          leaveRequestId: e.leaveRequestId ?? null,
          remarks: e.remarks ?? null,
          createdBy: ctx.userId,
        })),
      );

      RequestContextStore.addAudit({
        action: 'attendance.marked',
        entityType: 'attendance_registers',
        entityId: register.id,
      });

      return {
        registerId: register.id,
        day: dto.day,
        sectionLabel: `${section.className}-${section.sectionName}`,
        presentCount,
        absentCount,
        lateCount,
        totalCount: dto.entries.length,
        markedAt: register.markedAt?.toISOString() ?? new Date().toISOString(),
        alertStudentIds: dto.entries
          .filter((e) => e.status === 'absent' || e.status === 'late')
          .map((e) => e.studentId),
      };
    });

    // AFTER commit — never hold a DB connection open for notification latency.
    const alertsQueued = await this.queue.enqueueAbsenteeAlerts({
      tenantId: ctx.tenantId!,
      registerId: result.registerId,
      day: result.day,
      studentIds: result.alertStudentIds,
    });

    // Activation event — first attendance register, reward referrals on this.
    // Deliberately not awaited: marking attendance must not wait on it. But a
    // failure here leaves the school permanently un-activated, which silently
    // skews its health band, its referral reward and the onboarding funnel.
    void this.onboarding.markActivated(ctx.tenantId!).catch((err: unknown) => {
      this.logger.error(
        `Could not mark tenant=${ctx.tenantId} activated after its first register: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    });

    return {
      registerId: result.registerId,
      day: result.day,
      sectionLabel: result.sectionLabel,
      presentCount: result.presentCount,
      absentCount: result.absentCount,
      lateCount: result.lateCount,
      totalCount: result.totalCount,
      markedAt: result.markedAt,
      alertsQueued,
    };
  }

  async amend(
    registerId: string,
    dto: AmendAttendanceDto,
    grant: GrantedPermission,
  ) {
    const ctx = RequestContextStore.get();

    return this.db.run(async (tx) => {
      const register = await this.repo.findRegisterById(tx, registerId);
      if (!register) throw new NotFoundException('Attendance register not found');

      this.assertSectionScope(grant, register.sectionId);

      const before = await this.repo.listEntries(tx, registerId);
      const beforeMap = new Map(before.map((e) => [e.studentId, e]));

      const changes: Record<string, { from: unknown; to: unknown }> = {};

      for (const entry of dto.entries) {
        const prev = beforeMap.get(entry.studentId);
        if (!prev) {
          throw new ApiException(
            422,
            'BUSINESS_RULE',
            'Cannot add a student who was not on the original register.',
            { studentId: entry.studentId },
          );
        }
        if (prev.status !== entry.status || prev.remarks !== (entry.remarks ?? null)) {
          changes[entry.studentId] = {
            from: { status: prev.status, remarks: prev.remarks },
            to: { status: entry.status, remarks: entry.remarks ?? null },
          };
          await this.repo.updateEntry(tx, registerId, entry.studentId, {
            status: entry.status,
            remarks: entry.remarks ?? null,
            inTime: entry.inTime ?? null,
            leaveRequestId: entry.leaveRequestId ?? null,
            updatedBy: ctx.userId,
          });
        }
      }

      const after = await this.repo.listEntries(tx, registerId);
      const presentCount = after.filter((e) =>
        ['present', 'late'].includes(e.status),
      ).length;
      const absentCount = after.filter((e) => e.status === 'absent').length;

      await this.repo.updateRegisterCounts(tx, registerId, {
        presentCount,
        absentCount,
        totalCount: after.length,
      });

      RequestContextStore.addAudit({
        action: 'attendance.amended',
        entityType: 'attendance_registers',
        entityId: registerId,
        changes: {
          reason: { from: null, to: dto.reason },
          ...changes,
        },
      });

      return {
        registerId,
        presentCount,
        absentCount,
        totalCount: after.length,
        changed: Object.keys(changes).length,
      };
    });
  }

  async pending(day: string, branchId: string | undefined): Promise<{
    data: PendingSectionDto[];
    meta: { marked: number; pending: number; total: number };
  }> {
    const ctx = RequestContextStore.get();
    const resolvedBranch = branchId ?? ctx.branchId;
    if (!resolvedBranch) {
      throw new ApiException(400, 'BAD_REQUEST', 'branchId is required');
    }

    const expectedBy = '09:00';
    const now = new Date();
    const [y, m, d] = day.split('-').map(Number);
    const [eh, em] = expectedBy.split(':').map(Number);
    const expectedAt = new Date(y, m - 1, d, eh, em);
    const minutesOverdue = Math.max(
      0,
      Math.floor((now.getTime() - expectedAt.getTime()) / 60_000),
    );

    return this.db.run(async (tx) => {
      const sessionId = await this.repo.findCurrentSessionId(tx, resolvedBranch);
      if (!sessionId) {
        return { data: [], meta: { marked: 0, pending: 0, total: 0 } };
      }

      const sectionsResult = await this.repo.listPendingSections(
        tx,
        resolvedBranch,
        day,
        sessionId,
      );

      return {
        data: sectionsResult.pending.map((s) => ({
          sectionId: s.sectionId,
          sectionLabel: `${s.className}-${s.sectionName}`,
          classTeacherName:
            [s.classTeacherFirstName, s.classTeacherLastName]
              .filter(Boolean)
              .join(' ') || null,
          periodLabel: null,
          expectedBy,
          minutesOverdue,
        })),
        meta: {
          marked: sectionsResult.marked,
          pending: sectionsResult.pending.length,
          total: sectionsResult.total,
        },
      };
    });
  }

  async summary(
    studentId: string,
    academicSessionId: string,
    termId: string | undefined,
    grant: GrantedPermission,
  ): Promise<AttendanceSummaryDto> {
    assertInScope(grant, { studentId });

    return this.db.run(async (tx) => {
      const row = await this.repo.getSummary(tx, studentId, academicSessionId, termId);
      return {
        workingDays: row?.workingDays ?? 0,
        presentDays: row?.presentDays ?? 0,
        absentDays: row?.absentDays ?? 0,
        lateDays: row?.lateDays ?? 0,
        leaveDays: row?.leaveDays ?? 0,
        percentageBp: row?.percentageBp ?? 0,
        // Monthly breakdown can be added once a monthly rollup exists; empty
        // for now so the parent screen still renders.
        monthly: [],
      };
    });
  }

  async studentCalendar(
    studentId: string,
    month: string,
    grant: GrantedPermission,
  ) {
    assertInScope(grant, { studentId });
    const [year, mon] = month.split('-').map(Number);
    const from = `${month}-01`;
    const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
    const to = `${month}-${String(lastDay).padStart(2, '0')}`;

    const rows = await this.db.run((tx) =>
      this.repo.studentMonthCalendar(tx, studentId, from, to),
    );

    return {
      studentId,
      month,
      days: rows.map((r) => ({ day: r.day, status: r.status })),
    };
  }

  private assertSectionScope(grant: GrantedPermission, sectionId: string): void {
    try {
      assertInScope(grant, { sectionId });
    } catch (err) {
      if (err instanceof ForbiddenException) {
        throw new ApiException(
          403,
          'SCOPE_VIOLATION',
          'This section is not one you teach.',
          { sectionId, permission: grant.code },
        );
      }
      throw err;
    }
  }
}

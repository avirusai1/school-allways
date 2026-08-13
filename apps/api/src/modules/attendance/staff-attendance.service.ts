import { Injectable, NotFoundException } from '@nestjs/common';

import {
  RequestContextStore,
  type GrantedPermission,
} from '../../common/context/request-context';
import { TenantDbService } from '../../common/database/tenant-db.service';
import { ApiException } from '../../common/errors/api.exception';
import {
  StaffAttendanceRepository,
  type StaffAttendanceUpsert,
} from './staff-attendance.repository';
import type {
  AmendStaffAttendanceDto,
  MarkStaffAttendanceDto,
  MarkStaffAttendanceResponseDto,
  StaffAttendanceSummaryDto,
  StaffRosterResponseDto,
} from './dto/staff-attendance.dto';

@Injectable()
export class StaffAttendanceService {
  constructor(
    private readonly db: TenantDbService,
    private readonly repo: StaffAttendanceRepository,
  ) {}

  /**
   * `attendance.staff.read` is legal at section and self scope, and most
   * teaching roles hold it at exactly those — they were given it so a teacher
   * can check their *own* record, not the staff room's. Staff have no section,
   * so scopeFilter would throw on this table; a narrower-than-branch grant is
   * therefore resolved to "your own row" rather than an error or the branch.
   */
  async roster(
    day: string,
    requestedBranchId: string | undefined,
    grant: GrantedPermission,
  ): Promise<StaffRosterResponseDto> {
    const ctx = RequestContextStore.get();
    const isFullRoster = grant.scope === 'tenant' || grant.scope === 'branch';
    const branchId = this.resolveBranch(grant, requestedBranchId);

    return this.db.run(async (tx) => {
      let onlyStaffId: string | undefined;

      if (!isFullRoster) {
        const own = ctx.userId
          ? await this.repo.staffIdForUser(tx, ctx.userId)
          : null;
        if (!own) {
          throw new ApiException(
            403,
            'SCOPE_VIOLATION',
            'You can only see your own attendance, and your login is not linked to a staff record.',
            { permission: grant.code },
          );
        }
        onlyStaffId = own;
      }

      const [rows, leave] = await Promise.all([
        this.repo.roster(tx, branchId, day, onlyStaffId),
        this.repo.approvedLeaveOn(tx, branchId, day),
      ]);

      const onLeave = new Set(leave.map((l) => l.staffId).filter(Boolean));

      const mapped = rows.map((r) => ({
        staffId: r.staffId,
        employeeCode: r.employeeCode,
        fullName: [r.firstName, r.lastName].filter(Boolean).join(' '),
        designation: r.designation,
        department: r.department,
        status: r.status ?? 'not_marked',
        inTime: r.inTime,
        outTime: r.outTime,
        remarks: r.remarks,
        onApprovedLeave: onLeave.has(r.staffId),
      }));

      return {
        branchId,
        day,
        rows: mapped,
        meta: {
          total: mapped.length,
          marked: mapped.filter((r) => r.status !== 'not_marked').length,
          present: mapped.filter(
            (r) => r.status === 'present' || r.status === 'late',
          ).length,
          isFullRoster,
        },
      };
    });
  }

  async mark(
    dto: MarkStaffAttendanceDto,
    grant: GrantedPermission,
  ): Promise<MarkStaffAttendanceResponseDto> {
    const ctx = RequestContextStore.get();
    const branchId = this.resolveBranch(grant, dto.branchId);

    const ids = dto.entries.map((e) => e.staffId);
    const duplicate = ids.length !== new Set(ids).size;
    if (duplicate) {
      throw new ApiException(
        422,
        'BUSINESS_RULE',
        'The same person appears twice in this register.',
      );
    }

    return this.db.run(async (tx) => {
      // One membership check for the batch. Marking someone from another
      // branch is the mistake worth catching here; RLS already stops another
      // school's staff from being visible at all.
      const valid = await this.repo.branchStaffIds(tx, branchId, ids);
      const stranger = ids.find((id) => !valid.has(id));
      if (stranger) {
        throw new ApiException(
          422,
          'BUSINESS_RULE',
          'One or more people on this register are not active staff of this branch.',
          { staffId: stranger },
        );
      }

      const leave = await this.repo.approvedLeaveOn(tx, branchId, dto.day);
      const leaveByStaff = new Map(
        leave.filter((l) => l.staffId).map((l) => [l.staffId!, l.id]),
      );

      const rows: StaffAttendanceUpsert[] = dto.entries.map((e) => ({
        tenantId: ctx.tenantId!,
        branchId,
        staffId: e.staffId,
        day: dto.day,
        status: e.status,
        inTime: e.inTime ?? null,
        outTime: e.outTime ?? null,
        workedMinutes: workedMinutes(e.inTime, e.outTime),
        remarks: e.remarks ?? null,
        // Links the register row back to the approval that explains it, so a
        // payroll query does not have to re-derive why someone was away.
        leaveRequestId:
          e.status === 'on_leave' ? (leaveByStaff.get(e.staffId) ?? null) : null,
        markedByUserId: ctx.userId,
      }));

      await this.repo.upsertMany(tx, rows);

      RequestContextStore.addAudit({
        action: 'attendance.staff.marked',
        entityType: 'staff_attendance',
        entityId: `${branchId}:${dto.day}`,
        changes: {
          entries: { from: null, to: rows.length },
        },
      });

      return {
        day: dto.day,
        branchId,
        total: rows.length,
        present: rows.filter((r) => r.status === 'present').length,
        absent: rows.filter((r) => r.status === 'absent').length,
        late: rows.filter((r) => r.status === 'late').length,
        onLeave: rows.filter((r) => r.status === 'on_leave').length,
        markedAt: new Date().toISOString(),
      };
    });
  }

  /**
   * The correction path: marked present at nine, went home sick at eleven.
   * Deliberately not a separate permission — unlike student attendance there
   * is no parent-facing notification riding on the original value.
   */
  async amend(
    staffId: string,
    day: string,
    dto: AmendStaffAttendanceDto,
    grant: GrantedPermission,
  ) {
    const ctx = RequestContextStore.get();

    if (
      dto.status === undefined &&
      dto.inTime === undefined &&
      dto.outTime === undefined &&
      dto.remarks === undefined
    ) {
      throw new ApiException(
        422,
        'BUSINESS_RULE',
        'Nothing to change — send at least one of status, in time, out time or remarks.',
      );
    }

    return this.db.run(async (tx) => {
      const existing = await this.repo.findDay(tx, staffId, day);
      if (!existing) {
        throw new NotFoundException(
          'This person has no attendance recorded for that day yet. Mark the register first.',
        );
      }

      // The row carries its own branch, so the guard runs against where the
      // record actually lives rather than whatever the caller believes.
      this.resolveBranch(grant, existing.branchId);

      const inTime = dto.inTime ?? existing.inTime;
      const outTime = dto.outTime ?? existing.outTime;

      const updated = await this.repo.updateDay(tx, existing.id, {
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.inTime !== undefined ? { inTime: dto.inTime } : {}),
        ...(dto.outTime !== undefined ? { outTime: dto.outTime } : {}),
        ...(dto.remarks !== undefined ? { remarks: dto.remarks } : {}),
        workedMinutes: workedMinutes(inTime, outTime),
        markedByUserId: ctx.userId,
      });

      RequestContextStore.addAudit({
        action: 'attendance.staff.amended',
        entityType: 'staff_attendance',
        entityId: existing.id,
        changes: {
          status: { from: existing.status, to: updated?.status },
        },
      });

      return updated;
    });
  }

  async summary(
    staffId: string,
    month: string,
    grant: GrantedPermission,
  ): Promise<StaffAttendanceSummaryDto> {
    const ctx = RequestContextStore.get();
    const { from, to } = monthBounds(month);

    return this.db.run(async (tx) => {
      if (grant.scope !== 'tenant' && grant.scope !== 'branch') {
        const own = ctx.userId
          ? await this.repo.staffIdForUser(tx, ctx.userId)
          : null;
        if (own !== staffId) {
          throw new ApiException(
            403,
            'SCOPE_VIOLATION',
            'You can only see your own attendance record.',
            { permission: grant.code },
          );
        }
      } else {
        const branchId = await this.repo.branchOfStaff(tx, staffId);
        if (!branchId) throw new NotFoundException('Staff member not found');
        this.resolveBranch(grant, branchId);
      }

      const rows = await this.repo.monthlySummary(tx, staffId, from, to);
      const by = (s: string) => rows.find((r) => r.status === s)?.days ?? 0;

      return {
        staffId,
        month,
        present: by('present'),
        absent: by('absent'),
        late: by('late'),
        halfDay: by('half_day'),
        onLeave: by('on_leave'),
        markedDays: rows
          .filter((r) => r.status !== 'not_marked')
          .reduce((n, r) => n + r.days, 0),
        workedMinutes: rows.reduce((n, r) => n + r.minutes, 0),
      };
    });
  }

  /**
   * `attendance.staff.mark` is branch-only by catalogue, and `.read` widens to
   * section/self. Either way the question on a write is the same: is this the
   * branch you hold? Tenant scope may cross branches; RLS keeps it inside the
   * school.
   */
  private resolveBranch(
    grant: GrantedPermission,
    requested: string | undefined,
  ): string {
    const ctx = RequestContextStore.get();

    if (grant.scope === 'tenant') {
      const branchId = requested ?? ctx.branchId;
      if (!branchId) {
        throw new ApiException(
          400,
          'BAD_REQUEST',
          'Choose a branch before marking staff attendance.',
        );
      }
      return branchId;
    }

    if (!ctx.branchId) {
      throw new ApiException(
        400,
        'BAD_REQUEST',
        'Your session is not attached to a branch.',
      );
    }
    if (requested && requested !== ctx.branchId) {
      throw new ApiException(
        403,
        'SCOPE_VIOLATION',
        'That branch is not the one you are signed in to.',
        { branchId: requested, permission: grant.code },
      );
    }
    return ctx.branchId;
  }
}

/** Null unless both ends are known; an open shift has no length yet. */
export function workedMinutes(
  inTime: string | null | undefined,
  outTime: string | null | undefined,
): number | null {
  if (!inTime || !outTime) return null;
  const start = toMinutes(inTime);
  const end = toMinutes(outTime);
  if (start === null || end === null) return null;
  // A shift ending before it started is a typo, not a night shift — schools
  // do not run those. Recording a negative would poison any payroll sum.
  return end >= start ? end - start : null;
}

function toMinutes(t: string): number | null {
  const [h, m] = t.split(':');
  const hours = Number(h);
  const mins = Number(m);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
  return hours * 60 + mins;
}

export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const from = `${month}-01`;
  // Day 0 of the next month is the last day of this one.
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return { from, to: `${month}-${String(last).padStart(2, '0')}` };
}

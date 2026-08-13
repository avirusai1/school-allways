import { Injectable } from '@nestjs/common';
import { and, asc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';

import { leaveRequests, staff, staffAttendance } from '@saw/db';

import type { Tx } from '../../common/database/tenant-db.service';
import type { MarkableStaffStatus } from './dto/staff-attendance.dto';

export type StaffAttendanceUpsert = {
  tenantId: string;
  branchId: string;
  staffId: string;
  day: string;
  status: MarkableStaffStatus;
  inTime: string | null;
  outTime: string | null;
  workedMinutes: number | null;
  remarks: string | null;
  leaveRequestId: string | null;
  markedByUserId: string | null;
};

@Injectable()
export class StaffAttendanceRepository {
  /**
   * The roster and the day's marks in one pass. A left join rather than two
   * queries because the register screen is useless without both halves, and
   * the row count is a branch headcount — tens, not thousands.
   */
  async roster(tx: Tx, branchId: string, day: string, onlyStaffId?: string) {
    return tx
      .select({
        staffId: staff.id,
        employeeCode: staff.employeeCode,
        firstName: staff.firstName,
        lastName: staff.lastName,
        designation: staff.designation,
        department: staff.department,
        status: staffAttendance.status,
        inTime: staffAttendance.inTime,
        outTime: staffAttendance.outTime,
        remarks: staffAttendance.remarks,
      })
      .from(staff)
      .leftJoin(
        staffAttendance,
        and(
          eq(staffAttendance.staffId, staff.id),
          eq(staffAttendance.day, day),
        ),
      )
      .where(
        and(
          eq(staff.branchId, branchId),
          eq(staff.status, 'active'),
          isNull(staff.deletedAt),
          onlyStaffId ? eq(staff.id, onlyStaffId) : undefined,
        ),
      )
      .orderBy(asc(staff.department), asc(staff.firstName), asc(staff.lastName));
  }

  /**
   * Approved leave covering the day, so the register can default those people
   * to `on_leave` instead of making a clerk remember who is away.
   */
  async approvedLeaveOn(tx: Tx, branchId: string, day: string) {
    return tx
      .select({ staffId: leaveRequests.staffId, id: leaveRequests.id })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.branchId, branchId),
          eq(leaveRequests.status, 'approved'),
          lte(leaveRequests.fromDate, day),
          gte(leaveRequests.toDate, day),
          isNull(leaveRequests.deletedAt),
        ),
      );
  }

  /** Guards the write: ids that are not active staff of this branch. */
  async branchStaffIds(tx: Tx, branchId: string, ids: string[]) {
    const rows = await tx
      .select({ id: staff.id })
      .from(staff)
      .where(
        and(
          eq(staff.branchId, branchId),
          eq(staff.status, 'active'),
          isNull(staff.deletedAt),
          inArray(staff.id, ids),
        ),
      );
    return new Set(rows.map((r) => r.id));
  }

  /**
   * One statement for the whole roster. The unique index on (staff_id, day) is
   * what makes re-marking a correction rather than a duplicate.
   */
  async upsertMany(tx: Tx, rows: StaffAttendanceUpsert[]): Promise<number> {
    if (rows.length === 0) return 0;

    const written = await tx
      .insert(staffAttendance)
      .values(rows)
      .onConflictDoUpdate({
        target: [staffAttendance.staffId, staffAttendance.day],
        set: {
          status: sql`excluded.status`,
          inTime: sql`excluded.in_time`,
          outTime: sql`excluded.out_time`,
          workedMinutes: sql`excluded.worked_minutes`,
          remarks: sql`excluded.remarks`,
          leaveRequestId: sql`excluded.leave_request_id`,
          markedByUserId: sql`excluded.marked_by_user_id`,
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: staffAttendance.id });

    return written.length;
  }

  async findDay(tx: Tx, staffId: string, day: string) {
    const [row] = await tx
      .select({
        id: staffAttendance.id,
        branchId: staffAttendance.branchId,
        status: staffAttendance.status,
        inTime: staffAttendance.inTime,
        outTime: staffAttendance.outTime,
        remarks: staffAttendance.remarks,
      })
      .from(staffAttendance)
      .where(and(eq(staffAttendance.staffId, staffId), eq(staffAttendance.day, day)))
      .limit(1);
    return row ?? null;
  }

  async updateDay(
    tx: Tx,
    id: string,
    patch: {
      status?: MarkableStaffStatus;
      inTime?: string | null;
      outTime?: string | null;
      workedMinutes?: number | null;
      remarks?: string | null;
      markedByUserId: string | null;
    },
  ) {
    const [row] = await tx
      .update(staffAttendance)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(staffAttendance.id, id))
      .returning({
        id: staffAttendance.id,
        staffId: staffAttendance.staffId,
        day: staffAttendance.day,
        status: staffAttendance.status,
        inTime: staffAttendance.inTime,
        outTime: staffAttendance.outTime,
        remarks: staffAttendance.remarks,
      });
    return row ?? null;
  }

  /** Grouped in the database — a month of rows is small, but so is the query. */
  async monthlySummary(tx: Tx, staffId: string, from: string, to: string) {
    return tx
      .select({
        status: staffAttendance.status,
        days: sql<number>`count(*)::int`,
        minutes: sql<number>`coalesce(sum(${staffAttendance.workedMinutes}), 0)::int`,
      })
      .from(staffAttendance)
      .where(
        and(
          eq(staffAttendance.staffId, staffId),
          gte(staffAttendance.day, from),
          lte(staffAttendance.day, to),
        ),
      )
      .groupBy(staffAttendance.status);
  }

  /** Maps the caller to their own staff row, for self-scoped reads. */
  async staffIdForUser(tx: Tx, userId: string): Promise<string | null> {
    const [row] = await tx
      .select({ id: staff.id })
      .from(staff)
      .where(and(eq(staff.userId, userId), isNull(staff.deletedAt)))
      .limit(1);
    return row?.id ?? null;
  }

  async branchOfStaff(tx: Tx, staffId: string): Promise<string | null> {
    const [row] = await tx
      .select({ branchId: staff.branchId })
      .from(staff)
      .where(eq(staff.id, staffId))
      .limit(1);
    return row?.branchId ?? null;
  }
}

import { Injectable } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  notInArray,
  sql,
} from 'drizzle-orm';

import {
  academicSessions,
  attendanceRegisters,
  classes,
  incidents,
  payments,
  sections,
  staff,
  staffAttendance,
} from '@saw/db';

import type { Tx } from '../../common/database/tenant-db.service';

/**
 * Every read here is an aggregate over one indexed range. The dashboard is the
 * most-opened screen in the product, so nothing in this file may scan a table
 * that grows with enrolment history — see docs/06 §2.
 */
@Injectable()
export class DashboardRepository {
  async currentSessionId(tx: Tx, branchId: string): Promise<string | null> {
    const [row] = await tx
      .select({ id: academicSessions.id })
      .from(academicSessions)
      .where(
        and(
          eq(academicSessions.branchId, branchId),
          eq(academicSessions.isCurrent, true),
        ),
      )
      .limit(1);
    return row?.id ?? null;
  }

  /**
   * Reads the denormalised counts the marking flow already wrote rather than
   * aggregating student_attendance: one row per section per day, roughly 40 for
   * a school, on att_register_branch_day_idx.
   */
  async attendanceToday(tx: Tx, branchId: string, day: string) {
    const [row] = await tx
      .select({
        present: sql<number>`coalesce(sum(${attendanceRegisters.presentCount}), 0)::int`,
        total: sql<number>`coalesce(sum(${attendanceRegisters.totalCount}), 0)::int`,
        marked: sql<number>`count(*)::int`,
      })
      .from(attendanceRegisters)
      .where(
        and(
          eq(attendanceRegisters.branchId, branchId),
          eq(attendanceRegisters.day, day),
          // Period registers would double-count a student who also appears on a
          // daily register; this tile is a headcount, not a sum of periods.
          isNull(attendanceRegisters.periodId),
        ),
      );

    return {
      present: row?.present ?? 0,
      total: row?.total ?? 0,
      markedSections: row?.marked ?? 0,
    };
  }

  /** Denominator for "24 of 30 sections marked". Bounded by class count. */
  async sectionCount(
    tx: Tx,
    branchId: string,
    academicSessionId: string,
  ): Promise<number> {
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(sections)
      .where(
        and(
          eq(sections.branchId, branchId),
          eq(sections.academicSessionId, academicSessionId),
          eq(sections.isActive, true),
        ),
      );
    return row?.n ?? 0;
  }

  /** The unmarked list itself — capped, because the banner links to the full view. */
  async unmarkedSections(
    tx: Tx,
    branchId: string,
    academicSessionId: string,
    day: string,
    limit: number,
  ) {
    const marked = tx
      .select({ sectionId: attendanceRegisters.sectionId })
      .from(attendanceRegisters)
      .where(
        and(
          eq(attendanceRegisters.branchId, branchId),
          eq(attendanceRegisters.day, day),
          isNull(attendanceRegisters.periodId),
        ),
      );

    return tx
      .select({
        sectionId: sections.id,
        sectionName: sections.name,
        className: classes.name,
        teacherFirstName: staff.firstName,
        teacherLastName: staff.lastName,
      })
      .from(sections)
      .innerJoin(classes, eq(classes.id, sections.classId))
      .leftJoin(staff, eq(staff.id, sections.classTeacherStaffId))
      .where(
        and(
          eq(sections.branchId, branchId),
          eq(sections.academicSessionId, academicSessionId),
          eq(sections.isActive, true),
          notInArray(sections.id, marked),
        ),
      )
      .orderBy(asc(classes.level), asc(sections.name))
      .limit(limit);
  }

  /** On staff_attendance_branch_day_idx — one row per staff member per day. */
  async staffToday(tx: Tx, branchId: string, day: string) {
    const [row] = await tx
      .select({
        present: sql<number>`(count(*) filter (where ${staffAttendance.status} in ('present','late')))::int`,
        marked: sql<number>`(count(*) filter (where ${staffAttendance.status} <> 'not_marked'))::int`,
      })
      .from(staffAttendance)
      .where(
        and(eq(staffAttendance.branchId, branchId), eq(staffAttendance.day, day)),
      );
    return { present: row?.present ?? 0, marked: row?.marked ?? 0 };
  }

  /** Roster denominator. Bounded by headcount, on staff_branch_status_idx. */
  async activeStaffCount(tx: Tx, branchId: string): Promise<number> {
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(staff)
      .where(and(eq(staff.branchId, branchId), eq(staff.status, 'active')));
    return row?.n ?? 0;
  }

  /**
   * Today's money and the fortnight behind it in one pass, so the tile and the
   * sparkline can never disagree. On payments_date_idx (branch_id, payment_date).
   */
  async collections(tx: Tx, branchId: string, from: string, to: string) {
    return tx
      .select({
        day: payments.paymentDate,
        amountPaise: sql<string>`coalesce(sum(${payments.amountPaise}), 0)`,
      })
      .from(payments)
      .where(
        and(
          eq(payments.branchId, branchId),
          gte(payments.paymentDate, from),
          lte(payments.paymentDate, to),
          // Money that never cleared is not money collected — a bounced cheque
          // stays out of the number a principal reads as today's takings.
          eq(payments.status, 'success'),
          isNull(payments.bouncedAt),
        ),
      )
      .groupBy(payments.paymentDate)
      .orderBy(asc(payments.paymentDate));
  }

  /**
   * The approvals queue, counted per type in one round trip. Each arm is an
   * index range over rows awaiting a human, a number that stays small by
   * definition: a school sitting on 10,000 pending approvals has a management
   * problem, not a query problem.
   */
  async pendingApprovals(tx: Tx, branchId: string) {
    const rows = await tx.execute<{ kind: string; n: number }>(sql`
      select 'staff_leave' as kind, count(*)::int as n
        from leave_requests
       where branch_id = ${branchId} and status = 'pending'
         and staff_id is not null and deleted_at is null
      union all
      select 'student_leave', count(*)::int
        from leave_requests
       where branch_id = ${branchId} and status = 'pending'
         and student_id is not null and deleted_at is null
      union all
      select 'fee_concession', count(*)::int
        from student_concessions
       where status = 'pending' and deleted_at is null
      union all
      select 'circular', count(*)::int
        from announcements
       where status = 'pending' and deleted_at is null
    `);

    const byKind = new Map(rows.map((r) => [r.kind, Number(r.n)]));
    return {
      staffLeave: byKind.get('staff_leave') ?? 0,
      studentLeave: byKind.get('student_leave') ?? 0,
      feeConcession: byKind.get('fee_concession') ?? 0,
      circular: byKind.get('circular') ?? 0,
    };
  }

  /**
   * Open incidents, newest first. Restricted ones are excluded here and read
   * nowhere on this screen: POSH, bullying and safe reports need a
   * record_access_grant and write a pii_access_logs row per read, neither of
   * which a dashboard tile can honour.
   */
  async openIncidents(tx: Tx, branchId: string, limit: number) {
    return tx
      .select({
        id: incidents.id,
        title: incidents.title,
        category: incidents.category,
        severity: incidents.severity,
        occurredAt: incidents.occurredAt,
      })
      .from(incidents)
      .where(
        and(
          eq(incidents.branchId, branchId),
          inArray(incidents.status, ['open', 'investigating']),
          eq(incidents.sensitivity, 'confidential'),
        ),
      )
      .orderBy(desc(incidents.occurredAt))
      .limit(limit);
  }
}

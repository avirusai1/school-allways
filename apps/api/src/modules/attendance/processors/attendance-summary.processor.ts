import { Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { attendanceRegisters, attendanceSummaries, studentAttendance } from '@saw/db';

import { TenantDbService, type Tx } from '../../../common/database/tenant-db.service';

/**
 * Nightly rollup: recomputes attendance_summaries so parent home screens are a
 * single indexed row read. Chunked at 500 to stay inside Postgres param limits.
 *
 * Three statements per chunk — aggregate, update, insert — rather than three
 * per student. At 500 students the previous shape was 1,500 sequential round
 * trips per chunk, which is why this needed fixing before it could be put on a
 * schedule and run against every school every night.
 */
@Injectable()
export class AttendanceSummaryProcessor {
  private readonly logger = new Logger(AttendanceSummaryProcessor.name);
  private readonly CHUNK = 500;

  constructor(private readonly db: TenantDbService) {}

  async recomputeSession(
    tenantId: string,
    academicSessionId: string,
    studentIds: string[],
  ): Promise<void> {
    for (let i = 0; i < studentIds.length; i += this.CHUNK) {
      const chunk = studentIds.slice(i, i + this.CHUNK);
      await this.db.asTenant(tenantId, (tx) =>
        this.recomputeChunk(tx, tenantId, academicSessionId, chunk),
      );
    }
    this.logger.log(
      `Recomputed attendance summaries tenant=${tenantId} session=${academicSessionId} ` +
        `students=${studentIds.length}`,
    );
  }

  private async recomputeChunk(
    tx: Tx,
    tenantId: string,
    academicSessionId: string,
    studentIds: string[],
  ): Promise<void> {
    // The join to registers is what scopes this to one academic session. Without
    // it a student's whole attendance history lands in every session's summary,
    // so the year after a rollover opens showing last year's absences.
    const aggregates = await tx
      .select({
        studentId: studentAttendance.studentId,
        workingDays: sql<number>`count(*)::int`,
        presentDays: sql<number>`(count(*) filter (where ${studentAttendance.status} in ('present','late')))::int`,
        absentDays: sql<number>`(count(*) filter (where ${studentAttendance.status} = 'absent'))::int`,
        lateDays: sql<number>`(count(*) filter (where ${studentAttendance.status} = 'late'))::int`,
        leaveDays: sql<number>`(count(*) filter (where ${studentAttendance.status} = 'on_leave'))::int`,
      })
      .from(studentAttendance)
      .innerJoin(
        attendanceRegisters,
        eq(attendanceRegisters.id, studentAttendance.registerId),
      )
      .where(
        and(
          inArray(studentAttendance.studentId, studentIds),
          eq(attendanceRegisters.academicSessionId, academicSessionId),
          sql`${studentAttendance.status} not in ('not_marked','holiday')`,
        ),
      )
      .groupBy(studentAttendance.studentId);

    if (aggregates.length === 0) return;

    const rows = aggregates.map((a) => {
      const working = Number(a.workingDays ?? 0);
      const present = Number(a.presentDays ?? 0);
      return {
        studentId: a.studentId,
        workingDays: working,
        presentDays: present,
        absentDays: Number(a.absentDays ?? 0),
        lateDays: Number(a.lateDays ?? 0),
        leaveDays: Number(a.leaveDays ?? 0),
        percentageBp: working > 0 ? Math.round((present / working) * 10_000) : 0,
      };
    });

    // termId NULL is not unique under a Postgres UNIQUE index, so ON CONFLICT
    // cannot see these rows. Update what exists, insert the rest — and keep the
    // existing ids, because this table is client-cached and a delete/reinsert
    // would replay to every device as a row disappearing.
    const existing = await tx
      .select({ studentId: attendanceSummaries.studentId })
      .from(attendanceSummaries)
      .where(
        and(
          inArray(
            attendanceSummaries.studentId,
            rows.map((r) => r.studentId),
          ),
          eq(attendanceSummaries.academicSessionId, academicSessionId),
          isNull(attendanceSummaries.termId),
        ),
      );
    const known = new Set(existing.map((e) => e.studentId));

    const updates = rows.filter((r) => known.has(r.studentId));
    if (updates.length > 0) {
      const values = updates.map(
        (r) =>
          sql`(${r.studentId}::uuid, ${r.workingDays}::int, ${r.presentDays}::int,
               ${r.absentDays}::int, ${r.lateDays}::int, ${r.leaveDays}::int,
               ${r.percentageBp}::int)`,
      );
      await tx.execute(sql`
        update attendance_summaries as s
        set working_days = v.working_days,
            present_days = v.present_days,
            absent_days = v.absent_days,
            late_days = v.late_days,
            leave_days = v.leave_days,
            percentage_bp = v.percentage_bp,
            last_computed_at = now(),
            updated_at = now()
        from (values ${sql.join(values, sql`, `)})
          as v(student_id, working_days, present_days, absent_days, late_days,
               leave_days, percentage_bp)
        where s.student_id = v.student_id
          and s.academic_session_id = ${academicSessionId}
          and s.term_id is null
      `);
    }

    const inserts = rows.filter((r) => !known.has(r.studentId));
    if (inserts.length > 0) {
      await tx.insert(attendanceSummaries).values(
        inserts.map((r) => ({
          tenantId,
          studentId: r.studentId,
          academicSessionId,
          termId: null,
          workingDays: r.workingDays,
          presentDays: r.presentDays,
          absentDays: r.absentDays,
          lateDays: r.lateDays,
          leaveDays: r.leaveDays,
          percentageBp: r.percentageBp,
          lastComputedAt: new Date(),
        })),
      );
    }
  }
}

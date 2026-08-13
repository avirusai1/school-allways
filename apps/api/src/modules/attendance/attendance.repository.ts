import { Injectable } from '@nestjs/common';
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  sql,
  type SQL,
} from 'drizzle-orm';

import {
  academicSessions,
  attendanceRegisters,
  attendanceSummaries,
  calendarDays,
  classes,
  leaveRequests,
  sections,
  staff,
  studentAttendance,
  studentEnrollments,
  students,
} from '@saw/db';

import type { Tx } from '../../common/database/tenant-db.service';

@Injectable()
export class AttendanceRepository {
  async findRegister(
    tx: Tx,
    sectionId: string,
    day: string,
    periodId: string | null,
  ) {
    const periodCond = periodId
      ? eq(attendanceRegisters.periodId, periodId)
      : isNull(attendanceRegisters.periodId);

    const [row] = await tx
      .select({
        id: attendanceRegisters.id,
        sectionId: attendanceRegisters.sectionId,
        day: attendanceRegisters.day,
        periodId: attendanceRegisters.periodId,
        mode: attendanceRegisters.mode,
        isLocked: attendanceRegisters.isLocked,
        markedAt: attendanceRegisters.markedAt,
        markedByStaffId: attendanceRegisters.markedByStaffId,
        presentCount: attendanceRegisters.presentCount,
        absentCount: attendanceRegisters.absentCount,
        totalCount: attendanceRegisters.totalCount,
        clientMutationId: attendanceRegisters.clientMutationId,
        academicSessionId: attendanceRegisters.academicSessionId,
        branchId: attendanceRegisters.branchId,
      })
      .from(attendanceRegisters)
      .where(and(eq(attendanceRegisters.sectionId, sectionId), eq(attendanceRegisters.day, day), periodCond))
      .limit(1);

    return row ?? null;
  }

  async findRegisterById(tx: Tx, registerId: string) {
    const [row] = await tx
      .select({
        id: attendanceRegisters.id,
        sectionId: attendanceRegisters.sectionId,
        day: attendanceRegisters.day,
        periodId: attendanceRegisters.periodId,
        mode: attendanceRegisters.mode,
        isLocked: attendanceRegisters.isLocked,
        markedAt: attendanceRegisters.markedAt,
        presentCount: attendanceRegisters.presentCount,
        absentCount: attendanceRegisters.absentCount,
        totalCount: attendanceRegisters.totalCount,
        academicSessionId: attendanceRegisters.academicSessionId,
        branchId: attendanceRegisters.branchId,
        clientMutationId: attendanceRegisters.clientMutationId,
      })
      .from(attendanceRegisters)
      .where(eq(attendanceRegisters.id, registerId))
      .limit(1);
    return row ?? null;
  }

  async findRegisterByMutationId(tx: Tx, mutationId: string) {
    const [row] = await tx
      .select({
        id: attendanceRegisters.id,
        day: attendanceRegisters.day,
        sectionId: attendanceRegisters.sectionId,
        presentCount: attendanceRegisters.presentCount,
        absentCount: attendanceRegisters.absentCount,
        totalCount: attendanceRegisters.totalCount,
        markedAt: attendanceRegisters.markedAt,
      })
      .from(attendanceRegisters)
      .where(eq(attendanceRegisters.clientMutationId, mutationId))
      .limit(1);
    return row ?? null;
  }

  async getSectionLabel(tx: Tx, sectionId: string) {
    const [row] = await tx
      .select({
        sectionId: sections.id,
        sectionName: sections.name,
        className: classes.name,
        branchId: sections.branchId,
        classTeacherStaffId: sections.classTeacherStaffId,
        academicSessionId: sections.academicSessionId,
      })
      .from(sections)
      .innerJoin(classes, eq(classes.id, sections.classId))
      .where(eq(sections.id, sectionId))
      .limit(1);
    return row ?? null;
  }

  async findSession(tx: Tx, sessionId: string) {
    const [row] = await tx
      .select({
        id: academicSessions.id,
        isLocked: academicSessions.isLocked,
        branchId: academicSessions.branchId,
      })
      .from(academicSessions)
      .where(eq(academicSessions.id, sessionId))
      .limit(1);
    return row ?? null;
  }

  async findCalendarDay(tx: Tx, academicSessionId: string, day: string) {
    const [row] = await tx
      .select({
        dayType: calendarDays.dayType,
        title: calendarDays.title,
      })
      .from(calendarDays)
      .where(
        and(
          eq(calendarDays.academicSessionId, academicSessionId),
          eq(calendarDays.day, day),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /**
   * Roster + leave in ONE query. Existing marks are joined so amend screens
   * pre-fill without a second round trip for the student list.
   */
  async loadRoster(
    tx: Tx,
    params: {
      sectionId: string;
      academicSessionId: string;
      day: string;
      registerId: string | null;
    },
  ) {
    return tx
      .select({
        studentId: students.id,
        enrollmentId: studentEnrollments.id,
        rollNo: studentEnrollments.rollNo,
        firstName: students.firstName,
        middleName: students.middleName,
        lastName: students.lastName,
        photoPath: students.photoPath,
        attendanceStatus: studentAttendance.status,
        remarks: studentAttendance.remarks,
        leaveRequestId: leaveRequests.id,
      })
      .from(studentEnrollments)
      .innerJoin(students, eq(students.id, studentEnrollments.studentId))
      .leftJoin(
        studentAttendance,
        params.registerId
          ? and(
              eq(studentAttendance.studentId, students.id),
              eq(studentAttendance.registerId, params.registerId),
            )
          : sql`false`,
      )
      .leftJoin(
        leaveRequests,
        and(
          eq(leaveRequests.studentId, students.id),
          eq(leaveRequests.status, 'approved'),
          lte(leaveRequests.fromDate, params.day),
          gte(leaveRequests.toDate, params.day),
        ),
      )
      .where(
        and(
          eq(studentEnrollments.sectionId, params.sectionId),
          eq(studentEnrollments.academicSessionId, params.academicSessionId),
          inArray(studentEnrollments.status, ['active', 'admitted', 'on_leave']),
        ),
      )
      .orderBy(asc(studentEnrollments.rollNo), asc(students.firstName));
  }

  async staffName(tx: Tx, staffId: string | null) {
    if (!staffId) return null;
    const [row] = await tx
      .select({
        firstName: staff.firstName,
        lastName: staff.lastName,
      })
      .from(staff)
      .where(eq(staff.id, staffId))
      .limit(1);
    if (!row) return null;
    return [row.firstName, row.lastName].filter(Boolean).join(' ');
  }

  async findStaffIdForUser(tx: Tx, userId: string) {
    const [row] = await tx
      .select({ id: staff.id })
      .from(staff)
      .where(eq(staff.userId, userId))
      .limit(1);
    return row?.id ?? null;
  }

  async enrollmentMap(
    tx: Tx,
    sectionId: string,
    academicSessionId: string,
    studentIds: string[],
  ) {
    if (studentIds.length === 0) return new Map<string, string>();
    const rows = await tx
      .select({
        studentId: studentEnrollments.studentId,
        enrollmentId: studentEnrollments.id,
      })
      .from(studentEnrollments)
      .where(
        and(
          eq(studentEnrollments.sectionId, sectionId),
          eq(studentEnrollments.academicSessionId, academicSessionId),
          inArray(studentEnrollments.studentId, studentIds),
        ),
      );
    return new Map(rows.map((r) => [r.studentId, r.enrollmentId]));
  }

  /** One query for the principal's pending widget — uses att_register_unmarked_idx. */
  async listPendingSections(tx: Tx, branchId: string, day: string, sessionId: string) {
    const markedRows = await tx
      .select({ sectionId: attendanceRegisters.sectionId })
      .from(attendanceRegisters)
      .where(
        and(
          eq(attendanceRegisters.branchId, branchId),
          eq(attendanceRegisters.day, day),
          sql`${attendanceRegisters.markedAt} IS NOT NULL`,
          isNull(attendanceRegisters.periodId),
        ),
      );
    const markedIds = markedRows.map((r) => r.sectionId);

    const allSections = await tx
      .select({
        sectionId: sections.id,
        sectionName: sections.name,
        className: classes.name,
        classTeacherFirstName: staff.firstName,
        classTeacherLastName: staff.lastName,
      })
      .from(sections)
      .innerJoin(classes, eq(classes.id, sections.classId))
      .leftJoin(staff, eq(staff.id, sections.classTeacherStaffId))
      .where(
        and(
          eq(sections.branchId, branchId),
          eq(sections.academicSessionId, sessionId),
          eq(sections.isActive, true),
        ),
      )
      .orderBy(asc(classes.level), asc(sections.name));

    const pending = markedIds.length
      ? allSections.filter((s) => !markedIds.includes(s.sectionId))
      : allSections;

    return {
      pending,
      marked: markedIds.length,
      total: allSections.length,
    };
  }

  async findCurrentSessionId(tx: Tx, branchId: string) {
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

  async getSummary(
    tx: Tx,
    studentId: string,
    academicSessionId: string,
    termId?: string,
  ) {
    const conditions: SQL[] = [
      eq(attendanceSummaries.studentId, studentId),
      eq(attendanceSummaries.academicSessionId, academicSessionId),
    ];
    if (termId) conditions.push(eq(attendanceSummaries.termId, termId));
    else conditions.push(isNull(attendanceSummaries.termId));

    const [row] = await tx
      .select({
        workingDays: attendanceSummaries.workingDays,
        presentDays: attendanceSummaries.presentDays,
        absentDays: attendanceSummaries.absentDays,
        lateDays: attendanceSummaries.lateDays,
        leaveDays: attendanceSummaries.leaveDays,
        percentageBp: attendanceSummaries.percentageBp,
      })
      .from(attendanceSummaries)
      .where(and(...conditions))
      .limit(1);
    return row ?? null;
  }

  async studentMonthCalendar(tx: Tx, studentId: string, from: string, to: string) {
    return tx
      .select({
        day: studentAttendance.day,
        status: studentAttendance.status,
      })
      .from(studentAttendance)
      .where(
        and(
          eq(studentAttendance.studentId, studentId),
          gte(studentAttendance.day, from),
          lte(studentAttendance.day, to),
        ),
      )
      .orderBy(asc(studentAttendance.day));
  }

  async listEntries(tx: Tx, registerId: string) {
    return tx
      .select({
        studentId: studentAttendance.studentId,
        status: studentAttendance.status,
        remarks: studentAttendance.remarks,
        inTime: studentAttendance.inTime,
      })
      .from(studentAttendance)
      .where(eq(studentAttendance.registerId, registerId));
  }

  async insertRegister(
    tx: Tx,
    values: {
      tenantId: string;
      branchId: string;
      academicSessionId: string;
      sectionId: string;
      day: string;
      periodId: string | null;
      subjectId: string | null;
      mode: 'daily' | 'period';
      markedByStaffId: string | null;
      clientMutationId: string | null;
      presentCount: number;
      absentCount: number;
      totalCount: number;
      createdBy: string | null;
    },
  ) {
    const [row] = await tx
      .insert(attendanceRegisters)
      .values({
        ...values,
        markedAt: sql`now()`,
        isLocked: true,
      })
      .returning({
        id: attendanceRegisters.id,
        markedAt: attendanceRegisters.markedAt,
      });
    return row;
  }

  async bulkInsertEntries(
    tx: Tx,
    rows: Array<{
      tenantId: string;
      registerId: string;
      studentId: string;
      enrollmentId: string | null;
      day: string;
      sectionId: string;
      status: string;
      inTime: string | null;
      leaveRequestId: string | null;
      remarks: string | null;
      createdBy: string | null;
    }>,
  ) {
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await tx.insert(studentAttendance).values(
        rows.slice(i, i + CHUNK).map((r) => ({
          ...r,
          status: r.status as never,
        })),
      );
    }
  }

  async updateEntry(
    tx: Tx,
    registerId: string,
    studentId: string,
    values: {
      status: string;
      remarks: string | null;
      inTime: string | null;
      leaveRequestId: string | null;
      updatedBy: string | null;
    },
  ) {
    await tx
      .update(studentAttendance)
      .set({
        status: values.status as never,
        remarks: values.remarks,
        inTime: values.inTime,
        leaveRequestId: values.leaveRequestId,
        updatedBy: values.updatedBy,
      })
      .where(
        and(
          eq(studentAttendance.registerId, registerId),
          eq(studentAttendance.studentId, studentId),
        ),
      );
  }

  async updateRegisterCounts(
    tx: Tx,
    registerId: string,
    counts: { presentCount: number; absentCount: number; totalCount: number },
  ) {
    await tx
      .update(attendanceRegisters)
      .set(counts)
      .where(eq(attendanceRegisters.id, registerId));
  }
}

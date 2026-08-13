import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';

import {
  announcements,
  classes,
  leaveRequests,
  sections,
  staff,
  studentConcessions,
  studentEnrollments,
  students,
} from '@saw/db';

import type { Tx } from '../../common/database/tenant-db.service';

/**
 * The inbox is a working queue: every read here is bounded by the number of
 * things a human has not yet decided, which is why none of these need a cursor.
 * If a school ever has 500 pending items the problem is the school, but the
 * limit is still applied so one cannot wedge the screen.
 */
@Injectable()
export class ApprovalsRepository {
  async staffLeave(tx: Tx, branchId: string, limit: number) {
    return tx
      .select({
        id: leaveRequests.id,
        fromDate: leaveRequests.fromDate,
        toDate: leaveRequests.toDate,
        dayCount: leaveRequests.dayCount,
        reason: leaveRequests.reason,
        createdAt: leaveRequests.createdAt,
        firstName: staff.firstName,
        lastName: staff.lastName,
        designation: staff.designation,
      })
      .from(leaveRequests)
      .innerJoin(staff, eq(staff.id, leaveRequests.staffId))
      .where(
        and(
          eq(leaveRequests.branchId, branchId),
          eq(leaveRequests.status, 'pending'),
          isNotNull(leaveRequests.staffId),
          isNull(leaveRequests.deletedAt),
        ),
      )
      .orderBy(asc(leaveRequests.fromDate))
      .limit(limit);
  }

  /**
   * Joined through the enrolment so a section-scoped approver can be filtered
   * on something real — leave_requests itself has no section column.
   */
  async studentLeave(
    tx: Tx,
    branchId: string,
    limit: number,
    scope: SQL | undefined,
  ) {
    return tx
      .select({
        id: leaveRequests.id,
        fromDate: leaveRequests.fromDate,
        toDate: leaveRequests.toDate,
        dayCount: leaveRequests.dayCount,
        reason: leaveRequests.reason,
        createdAt: leaveRequests.createdAt,
        studentId: students.id,
        firstName: students.firstName,
        lastName: students.lastName,
        sectionId: studentEnrollments.sectionId,
        sectionName: sections.name,
        className: classes.name,
      })
      .from(leaveRequests)
      .innerJoin(students, eq(students.id, leaveRequests.studentId))
      .leftJoin(
        studentEnrollments,
        and(
          eq(studentEnrollments.studentId, students.id),
          inArray(studentEnrollments.status, ['active', 'admitted', 'on_leave']),
        ),
      )
      .leftJoin(sections, eq(sections.id, studentEnrollments.sectionId))
      .leftJoin(classes, eq(classes.id, sections.classId))
      .where(
        and(
          eq(leaveRequests.branchId, branchId),
          eq(leaveRequests.status, 'pending'),
          isNotNull(leaveRequests.studentId),
          isNull(leaveRequests.deletedAt),
          scope,
        ),
      )
      .orderBy(asc(leaveRequests.fromDate))
      .limit(limit);
  }

  async concessions(tx: Tx, limit: number, scope: SQL | undefined) {
    return tx
      .select({
        id: studentConcessions.id,
        type: studentConcessions.type,
        percentageBp: studentConcessions.percentageBp,
        flatAmountPaise: studentConcessions.flatAmountPaise,
        reason: studentConcessions.reason,
        createdAt: studentConcessions.createdAt,
        studentId: students.id,
        firstName: students.firstName,
        lastName: students.lastName,
        sectionId: studentEnrollments.sectionId,
        sectionName: sections.name,
        className: classes.name,
      })
      .from(studentConcessions)
      .innerJoin(students, eq(students.id, studentConcessions.studentId))
      .leftJoin(
        studentEnrollments,
        and(
          eq(studentEnrollments.studentId, students.id),
          eq(
            studentEnrollments.academicSessionId,
            studentConcessions.academicSessionId,
          ),
        ),
      )
      .leftJoin(sections, eq(sections.id, studentEnrollments.sectionId))
      .leftJoin(classes, eq(classes.id, sections.classId))
      .where(
        and(
          eq(studentConcessions.status, 'pending'),
          isNull(studentConcessions.deletedAt),
          scope,
        ),
      )
      .orderBy(asc(studentConcessions.createdAt))
      .limit(limit);
  }

  async circulars(tx: Tx, limit: number) {
    return tx
      .select({
        id: announcements.id,
        title: announcements.title,
        type: announcements.type,
        priority: announcements.priority,
        audienceType: announcements.audienceType,
        scheduledFor: announcements.scheduledFor,
        createdAt: announcements.createdAt,
      })
      .from(announcements)
      .where(
        and(eq(announcements.status, 'pending'), isNull(announcements.deletedAt)),
      )
      .orderBy(asc(announcements.createdAt))
      .limit(limit);
  }

  /** Section ids for the leave rows being decided, for the scope assertion. */
  async leaveTargets(tx: Tx, ids: string[]) {
    return tx
      .select({
        id: leaveRequests.id,
        staffId: leaveRequests.staffId,
        studentId: leaveRequests.studentId,
        status: leaveRequests.status,
        sectionId: studentEnrollments.sectionId,
      })
      .from(leaveRequests)
      .leftJoin(
        studentEnrollments,
        and(
          eq(studentEnrollments.studentId, leaveRequests.studentId),
          inArray(studentEnrollments.status, ['active', 'admitted', 'on_leave']),
        ),
      )
      .where(inArray(leaveRequests.id, ids));
  }

  async concessionTargets(tx: Tx, ids: string[]) {
    return tx
      .select({
        id: studentConcessions.id,
        studentId: studentConcessions.studentId,
        status: studentConcessions.status,
        sectionId: studentEnrollments.sectionId,
      })
      .from(studentConcessions)
      .leftJoin(
        studentEnrollments,
        and(
          eq(studentEnrollments.studentId, studentConcessions.studentId),
          eq(
            studentEnrollments.academicSessionId,
            studentConcessions.academicSessionId,
          ),
        ),
      )
      .where(inArray(studentConcessions.id, ids));
  }

  async circularTargets(tx: Tx, ids: string[]) {
    return tx
      .select({ id: announcements.id, status: announcements.status })
      .from(announcements)
      .where(inArray(announcements.id, ids));
  }

  /** One UPDATE for the whole selection — bulk approve is the common case. */
  async decideLeave(
    tx: Tx,
    ids: string[],
    approved: boolean,
    userId: string | null,
    reason: string | null,
  ): Promise<number> {
    const rows = await tx
      .update(leaveRequests)
      .set({
        status: approved ? 'approved' : 'rejected',
        approvedByUserId: userId,
        approvedAt: sql`now()`,
        rejectionReason: approved ? null : reason,
        updatedBy: userId,
      })
      .where(
        and(inArray(leaveRequests.id, ids), eq(leaveRequests.status, 'pending')),
      )
      .returning({ id: leaveRequests.id });
    return rows.length;
  }

  async decideConcessions(
    tx: Tx,
    ids: string[],
    approved: boolean,
    userId: string | null,
  ): Promise<number> {
    const rows = await tx
      .update(studentConcessions)
      .set({
        status: approved ? 'approved' : 'rejected',
        approvedByUserId: userId,
        approvedAt: sql`now()`,
        updatedBy: userId,
      })
      .where(
        and(
          inArray(studentConcessions.id, ids),
          eq(studentConcessions.status, 'pending'),
        ),
      )
      .returning({ id: studentConcessions.id });
    return rows.length;
  }

  async decideCirculars(
    tx: Tx,
    ids: string[],
    approved: boolean,
    userId: string | null,
  ): Promise<number> {
    const rows = await tx
      .update(announcements)
      .set({
        status: approved ? 'approved' : 'rejected',
        approvedByUserId: userId,
        approvedAt: sql`now()`,
        updatedBy: userId,
      })
      .where(
        and(inArray(announcements.id, ids), eq(announcements.status, 'pending')),
      )
      .returning({ id: announcements.id });
    return rows.length;
  }
}

import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, ilike, isNull, lt, or, type SQL } from 'drizzle-orm';

import {
  academicSessions,
  attendanceSummaries,
  classes,
  guardians,
  sections,
  studentEnrollments,
  studentGuardians,
  students,
} from '@saw/db';

import type { Tx } from '../../common/database/tenant-db.service';

@Injectable()
export class StudentsRepository {
  async list(
    tx: Tx,
    params: {
      academicSessionId: string;
      scopePredicate?: SQL;
      sectionId?: string;
      classId?: string;
      q?: string;
      status?: string;
      isRteStudent?: boolean;
      cursor?: { value: string; id: string };
      limit: number;
      sort: string;
      order: 'asc' | 'desc';
    },
  ) {
    const conditions: SQL[] = [
      eq(studentEnrollments.academicSessionId, params.academicSessionId),
    ];

    if (params.scopePredicate) conditions.push(params.scopePredicate);
    if (params.sectionId) conditions.push(eq(studentEnrollments.sectionId, params.sectionId));
    if (params.classId) conditions.push(eq(studentEnrollments.classId, params.classId));
    if (params.status) conditions.push(eq(studentEnrollments.status, params.status as never));
    if (params.isRteStudent !== undefined) {
      conditions.push(eq(students.isRteStudent, params.isRteStudent));
    }

    if (params.q) {
      conditions.push(
        or(
          ilike(students.firstName, `%${params.q}%`),
          ilike(students.lastName, `%${params.q}%`),
          ilike(students.admissionNo, `%${params.q}%`),
        )!,
      );
    }

    const sortCol = {
      name: students.firstName,
      rollNo: studentEnrollments.rollNo,
      admissionNo: students.admissionNo,
      createdAt: students.createdAt,
    }[params.sort] ?? students.firstName;

    if (params.cursor) {
      const cmp = params.order === 'asc' ? gt : lt;
      conditions.push(
        or(
          cmp(sortCol, params.cursor.value),
          and(eq(sortCol, params.cursor.value), cmp(students.id, params.cursor.id)),
        )!,
      );
    }

    const dir = params.order === 'asc' ? asc : desc;

    return tx
      .select({
        id: students.id,
        admissionNo: students.admissionNo,
        firstName: students.firstName,
        middleName: students.middleName,
        lastName: students.lastName,
        photoPath: students.photoPath,
        gender: students.gender,
        isRteStudent: students.isRteStudent,
        rollNo: studentEnrollments.rollNo,
        status: studentEnrollments.status,
        sectionName: sections.name,
        className: classes.name,
        attendancePercentageBp: attendanceSummaries.percentageBp,
        sortValue: sortCol,
      })
      .from(studentEnrollments)
      .innerJoin(students, eq(students.id, studentEnrollments.studentId))
      .leftJoin(sections, eq(sections.id, studentEnrollments.sectionId))
      .leftJoin(classes, eq(classes.id, studentEnrollments.classId))
      .leftJoin(
        attendanceSummaries,
        and(
          eq(attendanceSummaries.studentId, students.id),
          eq(attendanceSummaries.academicSessionId, params.academicSessionId),
          isNull(attendanceSummaries.termId),
        ),
      )
      .where(and(...conditions))
      .orderBy(dir(sortCol), dir(students.id))
      .limit(params.limit + 1);
  }

  async findById(tx: Tx, studentId: string, academicSessionId: string) {
    const [row] = await tx
      .select({
        id: students.id,
        admissionNo: students.admissionNo,
        firstName: students.firstName,
        middleName: students.middleName,
        lastName: students.lastName,
        dateOfBirth: students.dateOfBirth,
        photoPath: students.photoPath,
        gender: students.gender,
        bloodGroup: students.bloodGroup,
        socialCategory: students.socialCategory,
        isRteStudent: students.isRteStudent,
        addressLine1: students.addressLine1,
        addressLine2: students.addressLine2,
        city: students.city,
        district: students.district,
        state: students.state,
        pincode: students.pincode,
        apaarId: students.apaarId,
        apaarStatus: students.apaarStatus,
        apaarGeneratedAt: students.apaarGeneratedAt,
        rollNo: studentEnrollments.rollNo,
        status: studentEnrollments.status,
        sectionId: studentEnrollments.sectionId,
        sectionName: sections.name,
        className: classes.name,
        attendancePercentageBp: attendanceSummaries.percentageBp,
      })
      .from(students)
      .leftJoin(
        studentEnrollments,
        and(
          eq(studentEnrollments.studentId, students.id),
          eq(studentEnrollments.academicSessionId, academicSessionId),
        ),
      )
      .leftJoin(sections, eq(sections.id, studentEnrollments.sectionId))
      .leftJoin(classes, eq(classes.id, studentEnrollments.classId))
      .leftJoin(
        attendanceSummaries,
        and(
          eq(attendanceSummaries.studentId, students.id),
          eq(attendanceSummaries.academicSessionId, academicSessionId),
          isNull(attendanceSummaries.termId),
        ),
      )
      .where(eq(students.id, studentId))
      .limit(1);

    return row ?? null;
  }

  async listGuardians(tx: Tx, studentId: string) {
    return tx
      .select({
        id: guardians.id,
        fullName: guardians.fullName,
        phone: guardians.phone,
        relation: studentGuardians.relation,
        isPrimary: studentGuardians.isPrimary,
        canPayFees: studentGuardians.canPayFees,
        canPickup: studentGuardians.canPickup,
      })
      .from(studentGuardians)
      .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
      .where(eq(studentGuardians.studentId, studentId));
  }

  async findCurrentSessionId(tx: Tx, tenantId: string, branchId: string) {
    const [row] = await tx
      .select({ id: academicSessions.id })
      .from(academicSessions)
      .where(
        and(
          eq(academicSessions.tenantId, tenantId),
          eq(academicSessions.branchId, branchId),
          eq(academicSessions.isCurrent, true),
        ),
      )
      .limit(1);
    return row?.id ?? null;
  }
}

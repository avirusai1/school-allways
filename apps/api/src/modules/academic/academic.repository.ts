import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import {
  academicSessions,
  calendarDays,
  classes,
  classSubjects,
  sections,
  subjects,
  terms,
} from '@saw/db';

import type { Tx } from '../../common/database/tenant-db.service';

@Injectable()
export class AcademicRepository {
  listSessions(tx: Tx, branchId: string) {
    return tx
      .select({
        id: academicSessions.id,
        name: academicSessions.name,
        startDate: academicSessions.startDate,
        endDate: academicSessions.endDate,
        isCurrent: academicSessions.isCurrent,
        isLocked: academicSessions.isLocked,
      })
      .from(academicSessions)
      .where(eq(academicSessions.branchId, branchId))
      .orderBy(asc(academicSessions.startDate));
  }

  listClasses(tx: Tx, branchId: string) {
    return tx
      .select({
        id: classes.id,
        name: classes.name,
        level: classes.level,
        stage: classes.stage,
        stream: classes.stream,
        isActive: classes.isActive,
      })
      .from(classes)
      .where(and(eq(classes.branchId, branchId), eq(classes.isActive, true)))
      .orderBy(asc(classes.level));
  }

  listSections(tx: Tx, branchId: string, academicSessionId?: string) {
    const conditions = [eq(sections.branchId, branchId), eq(sections.isActive, true)];
    if (academicSessionId) conditions.push(eq(sections.academicSessionId, academicSessionId));

    // Correlated count rather than a join+group: setup screens read a handful of
    // sections, and it keeps sections with no students in the result.
    // Table names are spelled out because drizzle renders bare column names
    // inside sql templates, which would resolve both sides to the subquery.
    const studentCount = sql<number>`(
      select count(*)::int
      from student_enrollments se
      where se.section_id = sections.id
        and se.status in ('active','admitted')
    )`;

    return tx
      .select({
        id: sections.id,
        name: sections.name,
        classId: sections.classId,
        academicSessionId: sections.academicSessionId,
        capacity: sections.capacity,
        studentCount,
      })
      .from(sections)
      .where(and(...conditions))
      .orderBy(asc(sections.name));
  }

  listSubjects(tx: Tx, branchId: string) {
    return tx
      .select({
        id: subjects.id,
        code: subjects.code,
        name: subjects.name,
        type: subjects.type,
        isScholastic: subjects.isScholastic,
      })
      .from(subjects)
      .where(and(eq(subjects.branchId, branchId), eq(subjects.isActive, true)))
      .orderBy(asc(subjects.code));
  }

  listCalendar(tx: Tx, academicSessionId: string) {
    return tx
      .select({
        id: calendarDays.id,
        day: calendarDays.day,
        dayType: calendarDays.dayType,
        title: calendarDays.title,
      })
      .from(calendarDays)
      .where(eq(calendarDays.academicSessionId, academicSessionId))
      .orderBy(asc(calendarDays.day));
  }

  async classExists(tx: Tx, branchId: string, name: string, stream?: string | null) {
    const conditions = [eq(classes.branchId, branchId), eq(classes.name, name)];
    if (stream) {
      conditions.push(eq(classes.stream, stream));
    } else {
      conditions.push(isNull(classes.stream));
    }

    const [row] = await tx
      .select({ id: classes.id })
      .from(classes)
      .where(and(...conditions))
      .limit(1);
    return row ?? null;
  }

  async subjectExists(tx: Tx, branchId: string, code: string) {
    const [row] = await tx
      .select({ id: subjects.id })
      .from(subjects)
      .where(and(eq(subjects.branchId, branchId), eq(subjects.code, code)))
      .limit(1);
    return row ?? null;
  }

  insertClass(
    tx: Tx,
    values: {
      tenantId: string;
      branchId: string;
      name: string;
      level: number;
      stage?: string | null;
      stream?: string | null;
      createdBy?: string | null;
    },
  ) {
    return tx.insert(classes).values(values).returning({ id: classes.id });
  }

  insertSubject(
    tx: Tx,
    values: {
      tenantId: string;
      branchId: string;
      code: string;
      name: string;
      type: string;
      isScholastic?: boolean;
      createdBy?: string | null;
    },
  ) {
    return tx.insert(subjects).values(values).returning({ id: subjects.id });
  }

  listClassSubjectLinks(tx: Tx, academicSessionId: string) {
    return tx
      .select({
        classId: classSubjects.classId,
        subjectId: classSubjects.subjectId,
      })
      .from(classSubjects)
      .where(eq(classSubjects.academicSessionId, academicSessionId));
  }

  insertTerm(
    tx: Tx,
    values: {
      tenantId: string;
      academicSessionId: string;
      name: string;
      type: 'term';
      sequence: number;
      startDate: string;
      endDate: string;
    },
  ) {
    return tx.insert(terms).values(values).returning({ id: terms.id });
  }

  linkClassSubject(
    tx: Tx,
    values: {
      tenantId: string;
      classId: string;
      subjectId: string;
      academicSessionId: string;
    },
  ) {
    return tx.insert(classSubjects).values(values);
  }
}

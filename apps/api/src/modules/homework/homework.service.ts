import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';

import {
  diaryEntries,
  homework,
  homeworkSubmissions,
  staff,
  studentEnrollments,
  students,
  subjects,
} from '@saw/db';

import {
  RequestContextStore,
  type GrantedPermission,
} from '../../common/context/request-context';
import { TenantDbService } from '../../common/database/tenant-db.service';
import { ApiException } from '../../common/errors/api.exception';
import { assertInScope } from '../../common/rbac/scope.util';
import type {
  CreateDiaryDto,
  CreateHomeworkDto,
  GradeHomeworkDto,
  ListDiaryQuery,
  ListHomeworkQuery,
  SubmitHomeworkDto,
} from './dto/homework.dto';

@Injectable()
export class HomeworkService {
  constructor(private readonly db: TenantDbService) {}

  async list(query: ListHomeworkQuery, grant: GrantedPermission) {
    if (query.sectionId) {
      this.assertSection(grant, query.sectionId);
    }

    return this.db.run(async (tx) => {
      const conditions = [];
      if (query.sectionId) conditions.push(eq(homework.sectionId, query.sectionId));
      if (query.status) conditions.push(eq(homework.status, query.status as never));

      // Scope: section-scoped teachers only see their sections.
      if (grant.scope === 'section') {
        const ids = grant.sectionIds ?? [];
        if (ids.length === 0) {
          return { data: [], meta: { hasMore: false, count: 0, nextCursor: null } };
        }
        conditions.push(inArray(homework.sectionId, ids));
      }

      const rows = await tx
        .select({
          id: homework.id,
          sectionId: homework.sectionId,
          subjectId: homework.subjectId,
          title: homework.title,
          description: homework.description,
          assignedOn: homework.assignedOn,
          dueOn: homework.dueOn,
          status: homework.status,
          requiresSubmission: homework.requiresSubmission,
          seenCount: homework.seenCount,
          submittedCount: homework.submittedCount,
          maxMarks: homework.maxMarks,
        })
        .from(homework)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(homework.assignedOn))
        .limit(Math.min(query.limit, 100));

      return {
        data: rows,
        meta: { hasMore: false, count: rows.length, nextCursor: null },
      };
    });
  }

  /** Parent feed for one or more children — ONE query with inArray. */
  async feed(studentIds: string[], grant: GrantedPermission) {
    for (const id of studentIds) {
      assertInScope(grant, { studentId: id });
    }

    return this.db.run(async (tx) => {
      const rows = await tx
        .select({
          id: homework.id,
          studentId: homeworkSubmissions.studentId,
          studentFirstName: students.firstName,
          studentLastName: students.lastName,
          title: homework.title,
          description: homework.description,
          assignedOn: homework.assignedOn,
          dueOn: homework.dueOn,
          status: homework.status,
          subjectName: subjects.shortName,
          subjectFullName: subjects.name,
          submissionStatus: homeworkSubmissions.status,
          seenAt: homeworkSubmissions.seenAt,
          submittedAt: homeworkSubmissions.submittedAt,
          marksObtained: homeworkSubmissions.marksObtained,
        })
        .from(homeworkSubmissions)
        .innerJoin(homework, eq(homework.id, homeworkSubmissions.homeworkId))
        .innerJoin(students, eq(students.id, homeworkSubmissions.studentId))
        .leftJoin(subjects, eq(subjects.id, homework.subjectId))
        .where(
          and(
            inArray(homeworkSubmissions.studentId, studentIds),
            eq(homework.status, 'published'),
          ),
        )
        .orderBy(desc(homework.assignedOn))
        .limit(100);

      return {
        data: rows.map((r) => ({
          id: r.id,
          studentId: r.studentId,
          studentName: [r.studentFirstName, r.studentLastName].filter(Boolean).join(' '),
          title: r.title,
          description: r.description,
          assignedOn: r.assignedOn,
          dueOn: r.dueOn,
          status: r.status,
          subjectName: r.subjectName ?? r.subjectFullName,
          submissionStatus: r.submissionStatus,
          seenAt: r.seenAt?.toISOString() ?? null,
          submittedAt: r.submittedAt?.toISOString() ?? null,
          marksObtained: r.marksObtained,
        })),
        meta: { hasMore: false, count: rows.length, nextCursor: null },
      };
    });
  }

  async create(dto: CreateHomeworkDto, grant: GrantedPermission) {
    this.assertSection(grant, dto.sectionId, dto.subjectId);
    const ctx = RequestContextStore.get();

    return this.db.run(async (tx) => {
      const staffId = ctx.userId
        ? (
            await tx
              .select({ id: staff.id })
              .from(staff)
              .where(eq(staff.userId, ctx.userId))
              .limit(1)
          )[0]?.id ?? null
        : null;

      const [created] = await tx
        .insert(homework)
        .values({
          tenantId: ctx.tenantId!,
          branchId: ctx.branchId!,
          sectionId: dto.sectionId,
          subjectId: dto.subjectId ?? null,
          assignedByStaffId: staffId,
          title: dto.title,
          description: dto.description ?? null,
          assignedOn: dto.assignedOn,
          dueOn: dto.dueOn ?? null,
          requiresSubmission: dto.requiresSubmission ?? false,
          maxMarks: dto.maxMarks ?? null,
          status: 'published',
          createdBy: ctx.userId,
        })
        .returning({ id: homework.id });

      // Bulk-create seen stubs for every student in the section — ONE insert.
      const roster = await tx
        .select({ studentId: studentEnrollments.studentId })
        .from(studentEnrollments)
        .where(
          and(
            eq(studentEnrollments.sectionId, dto.sectionId),
            inArray(studentEnrollments.status, ['active', 'admitted', 'on_leave']),
          ),
        );

      if (roster.length) {
        const CHUNK = 500;
        const stubs = roster.map((r) => ({
          tenantId: ctx.tenantId!,
          homeworkId: created.id,
          studentId: r.studentId,
          status: 'pending' as const,
        }));
        for (let i = 0; i < stubs.length; i += CHUNK) {
          await tx.insert(homeworkSubmissions).values(stubs.slice(i, i + CHUNK));
        }
      }

      RequestContextStore.addAudit({
        action: 'homework.created',
        entityType: 'homework',
        entityId: created.id,
      });

      return { id: created.id, stubCount: roster.length };
    });
  }

  async markSeen(homeworkId: string, studentId: string, grant: GrantedPermission) {
    assertInScope(grant, { studentId });

    await this.db.run(async (tx) => {
      const [updated] = await tx
        .update(homeworkSubmissions)
        .set({ seenAt: sql`now()` })
        .where(
          and(
            eq(homeworkSubmissions.homeworkId, homeworkId),
            eq(homeworkSubmissions.studentId, studentId),
            sql`${homeworkSubmissions.seenAt} IS NULL`,
          ),
        )
        .returning({ id: homeworkSubmissions.id });

      if (updated) {
        await tx
          .update(homework)
          .set({ seenCount: sql`${homework.seenCount} + 1` })
          .where(eq(homework.id, homeworkId));
      }
    });

    return { seen: true };
  }

  async submit(
    homeworkId: string,
    studentId: string,
    dto: SubmitHomeworkDto,
    grant: GrantedPermission,
  ) {
    assertInScope(grant, { studentId });

    return this.db.run(async (tx) => {
      const [hw] = await tx
        .select({
          requiresSubmission: homework.requiresSubmission,
          allowLateSubmission: homework.allowLateSubmission,
          dueOn: homework.dueOn,
        })
        .from(homework)
        .where(eq(homework.id, homeworkId))
        .limit(1);
      if (!hw) throw new NotFoundException('Homework not found');
      if (!hw.requiresSubmission) {
        throw new ApiException(
          422,
          'BUSINESS_RULE',
          'This homework does not require a submission.',
        );
      }

      const late =
        !!hw.dueOn && new Date(hw.dueOn) < new Date(new Date().toISOString().slice(0, 10));
      if (late && !hw.allowLateSubmission) {
        throw new ApiException(422, 'BUSINESS_RULE', 'Late submissions are not allowed.');
      }

      await tx
        .update(homeworkSubmissions)
        .set({
          status: late ? 'late' : 'submitted',
          submittedAt: sql`now()`,
          responseText: dto.responseText ?? null,
          attachmentPaths: dto.attachmentPaths ?? [],
          seenAt: sql`coalesce(${homeworkSubmissions.seenAt}, now())`,
        })
        .where(
          and(
            eq(homeworkSubmissions.homeworkId, homeworkId),
            eq(homeworkSubmissions.studentId, studentId),
          ),
        );

      await tx
        .update(homework)
        .set({ submittedCount: sql`${homework.submittedCount} + 1` })
        .where(eq(homework.id, homeworkId));

      return { submitted: true, late };
    });
  }

  async grade(
    homeworkId: string,
    studentId: string,
    dto: GradeHomeworkDto,
    grant: GrantedPermission,
  ) {
    const ctx = RequestContextStore.get();

    return this.db.run(async (tx) => {
      const [hw] = await tx
        .select({
          sectionId: homework.sectionId,
          subjectId: homework.subjectId,
          maxMarks: homework.maxMarks,
        })
        .from(homework)
        .where(eq(homework.id, homeworkId))
        .limit(1);
      if (!hw) throw new NotFoundException('Homework not found');
      this.assertSection(grant, hw.sectionId, hw.subjectId);

      if (hw.maxMarks != null && dto.marksObtained > hw.maxMarks) {
        throw new ApiException(
          422,
          'BUSINESS_RULE',
          `Marks cannot exceed the maximum of ${hw.maxMarks}.`,
        );
      }

      const staffId = ctx.userId
        ? (
            await tx
              .select({ id: staff.id })
              .from(staff)
              .where(eq(staff.userId, ctx.userId))
              .limit(1)
          )[0]?.id ?? null
        : null;

      await tx
        .update(homeworkSubmissions)
        .set({
          status: 'graded',
          marksObtained: dto.marksObtained,
          teacherRemarks: dto.teacherRemarks ?? null,
          gradedByStaffId: staffId,
          gradedAt: sql`now()`,
        })
        .where(
          and(
            eq(homeworkSubmissions.homeworkId, homeworkId),
            eq(homeworkSubmissions.studentId, studentId),
          ),
        );

      return { graded: true };
    });
  }

  /**
   * Parent diary feed. Accepts one or many student ids (the controller resolves
   * "omit studentId → all linked children" the same way homework/feed does).
   *
   * Also includes section-wide notes (student_id IS NULL) for each child's
   * current section — otherwise a teacher note to the whole class never
   * reaches any parent.
   */
  async listDiary(
    studentIds: string[],
    query: Pick<ListDiaryQuery, 'from' | 'to'>,
    grant: GrantedPermission,
  ) {
    return this.db.run(async (tx) => {
      for (const id of studentIds) {
        await this.assertStudentAccessible(tx, grant, id);
      }

      const enrollments = await tx
        .select({
          studentId: studentEnrollments.studentId,
          sectionId: studentEnrollments.sectionId,
        })
        .from(studentEnrollments)
        .where(
          and(
            inArray(studentEnrollments.studentId, studentIds),
            inArray(studentEnrollments.status, ['active', 'admitted', 'on_leave']),
          ),
        );
      const sectionIds = [
        ...new Set(enrollments.map((e) => e.sectionId).filter(Boolean)),
      ] as string[];

      const visibility = [
        inArray(diaryEntries.studentId, studentIds),
        ...(sectionIds.length
          ? [and(isNull(diaryEntries.studentId), inArray(diaryEntries.sectionId, sectionIds))]
          : []),
      ];

      const conditions = [or(...visibility)!];
      if (query.from) conditions.push(gte(diaryEntries.day, query.from));
      if (query.to) conditions.push(lte(diaryEntries.day, query.to));

      const rows = await tx
        .select({
          id: diaryEntries.id,
          day: diaryEntries.day,
          entryType: diaryEntries.entryType,
          body: diaryEntries.body,
          feedsHpc: diaryEntries.feedsHpc,
          acknowledgedAt: diaryEntries.acknowledgedAt,
          studentId: diaryEntries.studentId,
          studentFirstName: students.firstName,
          studentLastName: students.lastName,
          authorFirstName: staff.firstName,
          authorLastName: staff.lastName,
        })
        .from(diaryEntries)
        .leftJoin(students, eq(students.id, diaryEntries.studentId))
        .leftJoin(staff, eq(staff.id, diaryEntries.authorStaffId))
        .where(and(...conditions))
        .orderBy(desc(diaryEntries.day), desc(diaryEntries.createdAt))
        .limit(100);

      return {
        data: rows.map((r) => ({
          id: r.id,
          day: r.day,
          entryType: r.entryType,
          body: r.body,
          feedsHpc: r.feedsHpc,
          acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null,
          studentId: r.studentId,
          studentName: r.studentId
            ? [r.studentFirstName, r.studentLastName].filter(Boolean).join(' ')
            : null,
          authorName: r.authorFirstName
            ? [r.authorFirstName, r.authorLastName].filter(Boolean).join(' ')
            : null,
        })),
      };
    });
  }

  async createDiary(dto: CreateDiaryDto, grant: GrantedPermission) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      if (dto.sectionId) this.assertSection(grant, dto.sectionId);
      if (dto.studentId) {
        await this.assertStudentAccessible(tx, grant, dto.studentId, dto.sectionId);
      }

      const staffId = ctx.userId
        ? (
            await tx
              .select({ id: staff.id })
              .from(staff)
              .where(eq(staff.userId, ctx.userId))
              .limit(1)
          )[0]?.id ?? null
        : null;

      const [created] = await tx
        .insert(diaryEntries)
        .values({
          tenantId: ctx.tenantId!,
          branchId: ctx.branchId!,
          sectionId: dto.sectionId ?? null,
          studentId: dto.studentId ?? null,
          authorStaffId: staffId,
          day: dto.day,
          entryType: dto.entryType ?? 'note',
          body: dto.body,
          feedsHpc: dto.feedsHpc ?? false,
          createdBy: ctx.userId,
        })
        .returning({ id: diaryEntries.id });

      return created;
    });
  }

  /**
   * Section/subject grants need a section id; parents only have student ids.
   * Resolve the child's current section when the caller didn't pass one.
   */
  private async assertStudentAccessible(
    tx: Parameters<Parameters<TenantDbService['run']>[0]>[0],
    grant: GrantedPermission,
    studentId: string,
    knownSectionId?: string | null,
  ): Promise<void> {
    if (grant.scope === 'self' || grant.scope === 'tenant' || grant.scope === 'branch') {
      assertInScope(grant, { studentId, sectionId: knownSectionId });
      return;
    }

    let sectionId = knownSectionId ?? null;
    if (!sectionId) {
      const [enrollment] = await tx
        .select({ sectionId: studentEnrollments.sectionId })
        .from(studentEnrollments)
        .where(
          and(
            eq(studentEnrollments.studentId, studentId),
            inArray(studentEnrollments.status, ['active', 'admitted', 'on_leave']),
          ),
        )
        .limit(1);
      sectionId = enrollment?.sectionId ?? null;
    }

    // Diary rows aren't subject-tagged — section membership is the gate for
    // both section- and subject-scoped staff.
    if (!sectionId || !(grant.sectionIds ?? []).includes(sectionId)) {
      throw new ApiException(
        403,
        'SCOPE_VIOLATION',
        'This student is outside your assigned sections.',
        { studentId, permission: grant.code },
      );
    }
  }

  private assertSection(
    grant: GrantedPermission,
    sectionId: string,
    subjectId?: string | null,
  ): void {
    try {
      if (grant.scope === 'subject') {
        assertInScope(grant, { sectionId, subjectId: subjectId ?? undefined });
      } else {
        assertInScope(grant, { sectionId });
      }
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

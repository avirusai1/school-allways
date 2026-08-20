import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import {
  examSchedules,
  exams,
  gradeBands,
  hpcAssessments,
  hpcDomains,
  hpcIndicators,
  marks,
  marksSheets,
  reportCardTemplates,
  results,
  sections,
  studentEnrollments,
  students,
} from '@saw/db';

import {
  RequestContextStore,
  type GrantedPermission,
} from '../../common/context/request-context';
import { TenantDbService, type Tx } from '../../common/database/tenant-db.service';
import { ApiException } from '../../common/errors/api.exception';
import { assertInScope, scopeFilter } from '../../common/rbac/scope.util';
import type {
  CreateExamDto,
  CreateHpcAssessmentDto,
  CreateHpcDomainDto,
  CreateHpcIndicatorDto,
  CreateReportCardTemplateDto,
  GenerateReportCardsDto,
  ModerateMarksDto,
  PatchExamDto,
  ProcessResultsDto,
  SaveMarksDto,
  SeedHpcTemplateDto,
  UpsertSchedulesDto,
} from './dto/exams.dto';
import { ExamsQueueService } from './exams-queue.service';
import { CBSE_HPC_TEMPLATE } from './hpc-template';

const REPORT_CARD_CHUNK = 50;

@Injectable()
export class ExamsService {
  private readonly logger = new Logger(ExamsService.name);

  constructor(
    private readonly db: TenantDbService,
    private readonly queue: ExamsQueueService,
    private readonly config: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Exams
  // ---------------------------------------------------------------------------

  async listExams(academicSessionId?: string, termId?: string) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) =>
      tx
        .select({
          id: exams.id,
          name: exams.name,
          type: exams.type,
          academicSessionId: exams.academicSessionId,
          termId: exams.termId,
          startDate: exams.startDate,
          endDate: exams.endDate,
          weightageBp: exams.weightageBp,
          isPublished: exams.isPublished,
          isTimetablePublished: exams.isTimetablePublished,
          status: exams.status,
          classIds: exams.classIds,
        })
        .from(exams)
        .where(
          and(
            eq(exams.branchId, ctx.branchId!),
            academicSessionId
              ? eq(exams.academicSessionId, academicSessionId)
              : undefined,
            termId ? eq(exams.termId, termId) : undefined,
          ),
        )
        .orderBy(desc(exams.startDate))
        .limit(100),
    );
  }

  async createExam(dto: CreateExamDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [row] = await tx
        .insert(exams)
        .values({
          tenantId: ctx.tenantId!,
          branchId: ctx.branchId!,
          academicSessionId: dto.academicSessionId,
          termId: dto.termId,
          name: dto.name,
          type: dto.type ?? 'unit_test',
          gradingScaleId: dto.gradingScaleId,
          startDate: dto.startDate,
          endDate: dto.endDate,
          weightageBp: dto.weightageBp ?? 10_000,
          classIds: dto.classIds ?? [],
          status: 'draft',
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({
          id: exams.id,
          name: exams.name,
          isPublished: exams.isPublished,
          isTimetablePublished: exams.isTimetablePublished,
        });
      RequestContextStore.addAudit({
        action: 'exam.create',
        entityType: 'exams',
        entityId: row!.id,
      });
      return row;
    });
  }

  async patchExam(id: string, dto: PatchExamDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [row] = await tx
        .update(exams)
        .set({
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.type !== undefined ? { type: dto.type } : {}),
          ...(dto.gradingScaleId !== undefined
            ? { gradingScaleId: dto.gradingScaleId }
            : {}),
          ...(dto.startDate !== undefined ? { startDate: dto.startDate } : {}),
          ...(dto.endDate !== undefined ? { endDate: dto.endDate } : {}),
          ...(dto.weightageBp !== undefined ? { weightageBp: dto.weightageBp } : {}),
          ...(dto.classIds !== undefined ? { classIds: dto.classIds } : {}),
          updatedAt: new Date(),
          updatedBy: ctx.userId,
        })
        .where(eq(exams.id, id))
        .returning({ id: exams.id, name: exams.name });
      if (!row) throw new ApiException(404, 'NOT_FOUND', 'Exam not found');
      return row;
    });
  }

  async upsertSchedules(examId: string, dto: UpsertSchedulesDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      await this.requireExam(tx, examId);
      const saved = [];
      for (const s of dto.schedules) {
        const [row] = await tx
          .insert(examSchedules)
          .values({
            tenantId: ctx.tenantId!,
            examId,
            classId: s.classId,
            subjectId: s.subjectId,
            examDate: s.examDate,
            startTime: s.startTime,
            endTime: s.endTime,
            maxMarks: s.maxMarks,
            theoryMaxMarks: s.theoryMaxMarks,
            practicalMaxMarks: s.practicalMaxMarks,
            passMarks: s.passMarks ?? 33,
            roomNo: s.roomNo,
            invigilatorStaffId: s.invigilatorStaffId,
            syllabusNote: s.syllabusNote,
            createdBy: ctx.userId,
            updatedBy: ctx.userId,
          })
          .onConflictDoUpdate({
            target: [
              examSchedules.examId,
              examSchedules.classId,
              examSchedules.subjectId,
            ],
            set: {
              examDate: s.examDate,
              startTime: s.startTime,
              endTime: s.endTime,
              maxMarks: s.maxMarks,
              theoryMaxMarks: s.theoryMaxMarks,
              practicalMaxMarks: s.practicalMaxMarks,
              passMarks: s.passMarks ?? 33,
              roomNo: s.roomNo,
              invigilatorStaffId: s.invigilatorStaffId,
              syllabusNote: s.syllabusNote,
              updatedAt: new Date(),
              updatedBy: ctx.userId,
            },
          })
          .returning({
            id: examSchedules.id,
            classId: examSchedules.classId,
            subjectId: examSchedules.subjectId,
            examDate: examSchedules.examDate,
            maxMarks: examSchedules.maxMarks,
          });
        saved.push(row);
      }
      return { count: saved.length, schedules: saved };
    });
  }

  async listSchedules(examId: string, grant: GrantedPermission) {
    return this.db.run(async (tx) => {
      const exam = await this.requireExam(tx, examId);
      // Parents/students only see timetable after publish — independent of results.
      if (
        grant.scope === 'self' &&
        !exam.isTimetablePublished
      ) {
        return { isTimetablePublished: false, schedules: [] as unknown[] };
      }

      const rows = await tx
        .select({
          id: examSchedules.id,
          classId: examSchedules.classId,
          subjectId: examSchedules.subjectId,
          examDate: examSchedules.examDate,
          startTime: examSchedules.startTime,
          endTime: examSchedules.endTime,
          maxMarks: examSchedules.maxMarks,
          theoryMaxMarks: examSchedules.theoryMaxMarks,
          practicalMaxMarks: examSchedules.practicalMaxMarks,
          passMarks: examSchedules.passMarks,
          roomNo: examSchedules.roomNo,
          syllabusNote: examSchedules.syllabusNote,
        })
        .from(examSchedules)
        .where(eq(examSchedules.examId, examId))
        .orderBy(asc(examSchedules.examDate));

      return {
        isTimetablePublished: exam.isTimetablePublished,
        isPublished: exam.isPublished,
        schedules: rows,
      };
    });
  }

  async publishTimetable(examId: string) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [row] = await tx
        .update(exams)
        .set({
          isTimetablePublished: true,
          updatedAt: new Date(),
          updatedBy: ctx.userId,
        })
        .where(eq(exams.id, examId))
        .returning({
          id: exams.id,
          isTimetablePublished: exams.isTimetablePublished,
          isPublished: exams.isPublished,
        });
      if (!row) throw new ApiException(404, 'NOT_FOUND', 'Exam not found');
      RequestContextStore.addAudit({
        action: 'exam.publish_timetable',
        entityType: 'exams',
        entityId: examId,
      });
      return row;
    });
  }

  async publishResults(examId: string) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [row] = await tx
        .update(exams)
        .set({
          isPublished: true,
          publishedAt: new Date(),
          updatedAt: new Date(),
          updatedBy: ctx.userId,
        })
        .where(eq(exams.id, examId))
        .returning({
          id: exams.id,
          isPublished: exams.isPublished,
          isTimetablePublished: exams.isTimetablePublished,
          publishedAt: exams.publishedAt,
        });
      if (!row) throw new ApiException(404, 'NOT_FOUND', 'Exam not found');

      await tx
        .update(results)
        .set({
          isPublished: true,
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(results.examId, examId));

      RequestContextStore.addAudit({
        action: 'exam.publish_results',
        entityType: 'exams',
        entityId: examId,
      });
      return row;
    });
  }

  // ---------------------------------------------------------------------------
  // Marks sheets
  // ---------------------------------------------------------------------------

  async listMarksSheets(
    examId: string,
    sectionId: string,
    grant: GrantedPermission,
  ) {
    assertInScope(grant, { sectionId });
    return this.db.run(async (tx) => {
      const predicate = scopeFilter(
        grant,
        {
          sectionId: marksSheets.sectionId,
          subjectId: marksSheets.subjectId,
        },
        { branchId: RequestContextStore.get().branchId },
      );

      return tx
        .select({
          id: marksSheets.id,
          sectionId: marksSheets.sectionId,
          subjectId: marksSheets.subjectId,
          status: marksSheets.status,
          entryCount: marksSheets.entryCount,
          expectedCount: marksSheets.expectedCount,
          submittedAt: marksSheets.submittedAt,
          moderatedAt: marksSheets.moderatedAt,
        })
        .from(marksSheets)
        .where(
          and(
            eq(marksSheets.examId, examId),
            eq(marksSheets.sectionId, sectionId),
            predicate,
          ),
        )
        .orderBy(marksSheets.subjectId);
    });
  }

  async getOrCreateMarksSheet(
    examId: string,
    sectionId: string,
    subjectId: string,
    grant: GrantedPermission,
  ) {
    assertInScope(grant, { sectionId, subjectId });
    const ctx = RequestContextStore.get();

    return this.db.run(async (tx) => {
      await this.requireExam(tx, examId);

      const [section] = await tx
        .select({ id: sections.id, classId: sections.classId })
        .from(sections)
        .where(eq(sections.id, sectionId))
        .limit(1);
      if (!section) throw new ApiException(404, 'NOT_FOUND', 'Section not found');

      const [schedule] = await tx
        .select({
          maxMarks: examSchedules.maxMarks,
          theoryMaxMarks: examSchedules.theoryMaxMarks,
          practicalMaxMarks: examSchedules.practicalMaxMarks,
          passMarks: examSchedules.passMarks,
        })
        .from(examSchedules)
        .where(
          and(
            eq(examSchedules.examId, examId),
            eq(examSchedules.classId, section.classId),
            eq(examSchedules.subjectId, subjectId),
          ),
        )
        .limit(1);

      const roster = await tx
        .select({
          studentId: studentEnrollments.studentId,
          firstName: students.firstName,
          lastName: students.lastName,
          rollNo: studentEnrollments.rollNo,
        })
        .from(studentEnrollments)
        .innerJoin(students, eq(students.id, studentEnrollments.studentId))
        .where(
          and(
            eq(studentEnrollments.sectionId, sectionId),
            inArray(studentEnrollments.status, ['active', 'admitted', 'on_leave']),
          ),
        )
        .orderBy(studentEnrollments.rollNo);

      let [sheet] = await tx
        .select({
          id: marksSheets.id,
          status: marksSheets.status,
          entryCount: marksSheets.entryCount,
          expectedCount: marksSheets.expectedCount,
          clientMutationId: marksSheets.clientMutationId,
        })
        .from(marksSheets)
        .where(
          and(
            eq(marksSheets.examId, examId),
            eq(marksSheets.sectionId, sectionId),
            eq(marksSheets.subjectId, subjectId),
          ),
        )
        .limit(1);

      if (!sheet) {
        const [created] = await tx
          .insert(marksSheets)
          .values({
            tenantId: ctx.tenantId!,
            examId,
            sectionId,
            subjectId,
            status: 'not_started',
            expectedCount: roster.length,
            createdBy: ctx.userId,
            updatedBy: ctx.userId,
          })
          .returning({
            id: marksSheets.id,
            status: marksSheets.status,
            entryCount: marksSheets.entryCount,
            expectedCount: marksSheets.expectedCount,
            clientMutationId: marksSheets.clientMutationId,
          });
        sheet = created!;
      }

      const existing = await tx
        .select({
          id: marks.id,
          studentId: marks.studentId,
          marksObtained: marks.marksObtained,
          theoryMarks: marks.theoryMarks,
          practicalMarks: marks.practicalMarks,
          internalMarks: marks.internalMarks,
          isAbsent: marks.isAbsent,
          isExempted: marks.isExempted,
          remarks: marks.remarks,
          originalMarks: marks.originalMarks,
          grade: marks.grade,
        })
        .from(marks)
        .where(eq(marks.marksSheetId, sheet.id));

      const byStudent = new Map(existing.map((m) => [m.studentId, m]));

      return {
        marksSheetId: sheet.id,
        status: sheet.status,
        entryCount: sheet.entryCount,
        expectedCount: sheet.expectedCount,
        maxMarks: schedule?.maxMarks ?? 100,
        theoryMaxMarks: schedule?.theoryMaxMarks ?? null,
        practicalMaxMarks: schedule?.practicalMaxMarks ?? null,
        passMarks: schedule?.passMarks ?? 33,
        students: roster.map((r) => ({
          studentId: r.studentId,
          fullName: [r.firstName, r.lastName].filter(Boolean).join(' '),
          rollNo: r.rollNo,
          entry: byStudent.get(r.studentId) ?? null,
        })),
      };
    });
  }

  async saveMarks(examId: string, dto: SaveMarksDto, grant: GrantedPermission) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [sheet] = await tx
        .select({
          id: marksSheets.id,
          examId: marksSheets.examId,
          sectionId: marksSheets.sectionId,
          subjectId: marksSheets.subjectId,
          status: marksSheets.status,
          clientMutationId: marksSheets.clientMutationId,
        })
        .from(marksSheets)
        .where(eq(marksSheets.id, dto.marksSheetId))
        .limit(1);

      if (!sheet || sheet.examId !== examId) {
        throw new ApiException(404, 'NOT_FOUND', 'Marks sheet not found for this exam.');
      }
      assertInScope(grant, {
        sectionId: sheet.sectionId,
        subjectId: sheet.subjectId,
      });

      if (['submitted', 'moderated', 'locked', 'published'].includes(sheet.status)) {
        throw new ApiException(
          422,
          'SHEET_LOCKED',
          `Marks sheet is ${sheet.status} and cannot be edited. Ask a moderator to unlock if needed.`,
        );
      }

      // Idempotent replay — same clientMutationId returns current sheet state.
      if (
        dto.clientMutationId &&
        sheet.clientMutationId &&
        sheet.clientMutationId === dto.clientMutationId
      ) {
        return {
          marksSheetId: sheet.id,
          status: sheet.status,
          saved: 0,
          replayed: true,
        };
      }

      const [section] = await tx
        .select({ classId: sections.classId })
        .from(sections)
        .where(eq(sections.id, sheet.sectionId))
        .limit(1);

      const [schedule] = await tx
        .select({
          maxMarks: examSchedules.maxMarks,
          theoryMaxMarks: examSchedules.theoryMaxMarks,
          practicalMaxMarks: examSchedules.practicalMaxMarks,
        })
        .from(examSchedules)
        .where(
          and(
            eq(examSchedules.examId, examId),
            eq(examSchedules.classId, section!.classId),
            eq(examSchedules.subjectId, sheet.subjectId),
          ),
        )
        .limit(1);

      const maxMarks = schedule?.maxMarks ?? 100;
      const theoryMax = schedule?.theoryMaxMarks ?? maxMarks;
      const practicalMax = schedule?.practicalMaxMarks ?? maxMarks;

      const offenders: Array<{
        studentId: string;
        field: string;
        value: number;
        max: number;
      }> = [];

      for (const e of dto.entries) {
        if (e.isAbsent || e.isExempted) continue;
        if (e.theoryMarks != null && e.theoryMarks > theoryMax) {
          offenders.push({
            studentId: e.studentId,
            field: 'theoryMarks',
            value: e.theoryMarks,
            max: theoryMax,
          });
        }
        if (e.practicalMarks != null && e.practicalMarks > practicalMax) {
          offenders.push({
            studentId: e.studentId,
            field: 'practicalMarks',
            value: e.practicalMarks,
            max: practicalMax,
          });
        }
        const total =
          e.marksObtained ??
          (e.theoryMarks ?? 0) + (e.practicalMarks ?? 0) + (e.internalMarks ?? 0);
        if (
          e.marksObtained == null &&
          e.theoryMarks == null &&
          e.practicalMarks == null &&
          e.internalMarks == null
        ) {
          continue;
        }
        if (total > maxMarks && e.marksObtained != null) {
          offenders.push({
            studentId: e.studentId,
            field: 'marksObtained',
            value: total,
            max: maxMarks,
          });
        } else if (
          e.marksObtained == null &&
          (e.theoryMarks != null || e.practicalMarks != null) &&
          (e.theoryMarks ?? 0) + (e.practicalMarks ?? 0) > maxMarks
        ) {
          offenders.push({
            studentId: e.studentId,
            field: 'theory+practical',
            value: (e.theoryMarks ?? 0) + (e.practicalMarks ?? 0),
            max: maxMarks,
          });
        }
      }

      if (offenders.length > 0) {
        throw new ApiException(
          422,
          'MARKS_EXCEED_MAX',
          `Marks exceed maximum for ${offenders.length} student(s).`,
          { offenders },
        );
      }

      let saved = 0;
      for (const e of dto.entries) {
        const marksObtained = e.isAbsent || e.isExempted
          ? null
          : e.marksObtained ??
            ((e.theoryMarks != null || e.practicalMarks != null || e.internalMarks != null)
              ? (e.theoryMarks ?? 0) + (e.practicalMarks ?? 0) + (e.internalMarks ?? 0)
              : null);

        const percentageBp =
          marksObtained != null && maxMarks > 0
            ? Math.floor((marksObtained * 10_000) / maxMarks)
            : null;

        await tx
          .insert(marks)
          .values({
            tenantId: ctx.tenantId!,
            marksSheetId: sheet.id,
            studentId: e.studentId,
            examId,
            subjectId: sheet.subjectId,
            marksObtained,
            theoryMarks: e.theoryMarks,
            practicalMarks: e.practicalMarks,
            internalMarks: e.internalMarks,
            maxMarks,
            percentageBp,
            isAbsent: e.isAbsent ?? false,
            isExempted: e.isExempted ?? false,
            remarks: e.remarks,
            createdBy: ctx.userId,
            updatedBy: ctx.userId,
          })
          .onConflictDoUpdate({
            target: [marks.marksSheetId, marks.studentId],
            set: {
              marksObtained,
              theoryMarks: e.theoryMarks,
              practicalMarks: e.practicalMarks,
              internalMarks: e.internalMarks,
              maxMarks,
              percentageBp,
              isAbsent: e.isAbsent ?? false,
              isExempted: e.isExempted ?? false,
              remarks: e.remarks,
              updatedAt: new Date(),
              updatedBy: ctx.userId,
            },
          });
        saved += 1;
      }

      const [countRow] = await tx
        .select({
          n: sql<number>`count(*)::int`.mapWith(Number),
        })
        .from(marks)
        .where(eq(marks.marksSheetId, sheet.id));

      await tx
        .update(marksSheets)
        .set({
          status: 'in_progress',
          entryCount: countRow?.n ?? saved,
          clientMutationId: dto.clientMutationId,
          updatedAt: new Date(),
          updatedBy: ctx.userId,
        })
        .where(eq(marksSheets.id, sheet.id));

      return {
        marksSheetId: sheet.id,
        status: 'in_progress',
        saved,
        replayed: false,
      };
    });
  }

  async submitMarksSheet(examId: string, sheetId: string, grant: GrantedPermission) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [sheet] = await tx
        .select({
          id: marksSheets.id,
          examId: marksSheets.examId,
          sectionId: marksSheets.sectionId,
          subjectId: marksSheets.subjectId,
          status: marksSheets.status,
        })
        .from(marksSheets)
        .where(eq(marksSheets.id, sheetId))
        .limit(1);

      if (!sheet || sheet.examId !== examId) {
        throw new ApiException(404, 'NOT_FOUND', 'Marks sheet not found');
      }
      assertInScope(grant, {
        sectionId: sheet.sectionId,
        subjectId: sheet.subjectId,
      });

      if (sheet.status === 'submitted' || sheet.status === 'moderated') {
        return { id: sheet.id, status: sheet.status, alreadySubmitted: true };
      }

      const [updated] = await tx
        .update(marksSheets)
        .set({
          status: 'submitted',
          submittedAt: new Date(),
          updatedAt: new Date(),
          updatedBy: ctx.userId,
        })
        .where(eq(marksSheets.id, sheetId))
        .returning({
          id: marksSheets.id,
          status: marksSheets.status,
          submittedAt: marksSheets.submittedAt,
        });
      return { ...updated, alreadySubmitted: false };
    });
  }

  async moderateMarksSheet(
    examId: string,
    sheetId: string,
    dto: ModerateMarksDto,
  ) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [sheet] = await tx
        .select({
          id: marksSheets.id,
          examId: marksSheets.examId,
          status: marksSheets.status,
        })
        .from(marksSheets)
        .where(eq(marksSheets.id, sheetId))
        .limit(1);

      if (!sheet || sheet.examId !== examId) {
        throw new ApiException(404, 'NOT_FOUND', 'Marks sheet not found');
      }
      if (sheet.status !== 'submitted' && sheet.status !== 'moderated') {
        throw new ApiException(
          422,
          'NOT_SUBMITTED',
          'Only submitted sheets can be moderated.',
        );
      }

      for (const e of dto.entries) {
        const [existing] = await tx
          .select({
            id: marks.id,
            marksObtained: marks.marksObtained,
            originalMarks: marks.originalMarks,
            maxMarks: marks.maxMarks,
          })
          .from(marks)
          .where(
            and(eq(marks.marksSheetId, sheetId), eq(marks.studentId, e.studentId)),
          )
          .limit(1);

        if (!existing) {
          throw new ApiException(
            404,
            'NOT_FOUND',
            `No marks entry for student ${e.studentId}`,
          );
        }
        if (e.marksObtained > existing.maxMarks) {
          throw new ApiException(
            422,
            'MARKS_EXCEED_MAX',
            `Moderated marks exceed max for student ${e.studentId}`,
            {
              offenders: [
                {
                  studentId: e.studentId,
                  field: 'marksObtained',
                  value: e.marksObtained,
                  max: existing.maxMarks,
                },
              ],
            },
          );
        }

        // Preserve the teacher's original entry — never overwrite originalMarks
        // once set.
        const original =
          existing.originalMarks ?? existing.marksObtained ?? e.marksObtained;
        const percentageBp =
          existing.maxMarks > 0
            ? Math.floor((e.marksObtained * 10_000) / existing.maxMarks)
            : null;

        await tx
          .update(marks)
          .set({
            originalMarks: original,
            marksObtained: e.marksObtained,
            percentageBp,
            updatedAt: new Date(),
            updatedBy: ctx.userId,
          })
          .where(eq(marks.id, existing.id));
      }

      const [updated] = await tx
        .update(marksSheets)
        .set({
          status: 'moderated',
          moderatedByUserId: ctx.userId,
          moderatedAt: new Date(),
          moderationNote: dto.moderationNote,
          updatedAt: new Date(),
          updatedBy: ctx.userId,
        })
        .where(eq(marksSheets.id, sheetId))
        .returning({
          id: marksSheets.id,
          status: marksSheets.status,
          moderatedAt: marksSheets.moderatedAt,
        });

      return updated;
    });
  }

  // ---------------------------------------------------------------------------
  // Results
  // ---------------------------------------------------------------------------

  async enqueueProcessResults(examId: string, dto: ProcessResultsDto) {
    const ctx = RequestContextStore.get();
    const enqueued = await this.queue.enqueueProcessResults({
      tenantId: ctx.tenantId!,
      branchId: ctx.branchId!,
      examId,
      userId: ctx.userId,
      sectionIds: dto.sectionIds,
    });

    if (!enqueued.queued) {
      await this.processResultsForExam({
        tenantId: ctx.tenantId!,
        branchId: ctx.branchId!,
        examId,
        userId: ctx.userId,
        sectionIds: dto.sectionIds,
      });
    }

    return { jobId: enqueued.jobId, examId, queued: enqueued.queued };
  }

  /**
   * Aggregate marks → results in one pass per section; store rank via window
   * ordering (computed once, never on every parent home open).
   */
  async processResultsForExam(job: {
    tenantId: string;
    branchId: string;
    examId: string;
    userId: string | null;
    sectionIds?: string[];
  }): Promise<{ students: number }> {
    return this.db.asTenant(job.tenantId, async (tx) => {
      const [exam] = await tx
        .select({
          id: exams.id,
          academicSessionId: exams.academicSessionId,
          termId: exams.termId,
          weightageBp: exams.weightageBp,
          gradingScaleId: exams.gradingScaleId,
          isPublished: exams.isPublished,
        })
        .from(exams)
        .where(eq(exams.id, job.examId))
        .limit(1);
      if (!exam) throw new ApiException(404, 'NOT_FOUND', 'Exam not found');

      const bands = exam.gradingScaleId
        ? await tx
            .select({
              grade: gradeBands.grade,
              minPercentageBp: gradeBands.minPercentageBp,
              maxPercentageBp: gradeBands.maxPercentageBp,
            })
            .from(gradeBands)
            .where(eq(gradeBands.gradingScaleId, exam.gradingScaleId))
            .orderBy(desc(gradeBands.minPercentageBp))
        : [];

      const sheetFilter = and(
        eq(marksSheets.examId, job.examId),
        job.sectionIds?.length
          ? inArray(marksSheets.sectionId, job.sectionIds)
          : undefined,
      );

      const sheets = await tx
        .select({
          id: marksSheets.id,
          sectionId: marksSheets.sectionId,
          subjectId: marksSheets.subjectId,
        })
        .from(marksSheets)
        .where(sheetFilter);

      if (sheets.length === 0) return { students: 0 };

      const sheetIds = sheets.map((s) => s.id);
      const allMarks = await tx
        .select({
          studentId: marks.studentId,
          subjectId: marks.subjectId,
          marksObtained: marks.marksObtained,
          maxMarks: marks.maxMarks,
          isAbsent: marks.isAbsent,
          isExempted: marks.isExempted,
          marksSheetId: marks.marksSheetId,
        })
        .from(marks)
        .where(inArray(marks.marksSheetId, sheetIds));

      const sectionBySheet = new Map(sheets.map((s) => [s.id, s.sectionId]));

      type Agg = {
        obtained: number;
        total: number;
        failedSubjectIds: string[];
        absent: boolean;
        sectionId: string;
      };
      const byStudent = new Map<string, Agg>();

      for (const m of allMarks) {
        const sectionId = sectionBySheet.get(m.marksSheetId)!;
        const agg = byStudent.get(m.studentId) ?? {
          obtained: 0,
          total: 0,
          failedSubjectIds: [],
          absent: false,
          sectionId,
        };
        if (m.isAbsent) {
          agg.absent = true;
          byStudent.set(m.studentId, agg);
          continue;
        }
        if (m.isExempted || m.marksObtained == null) {
          byStudent.set(m.studentId, agg);
          continue;
        }
        agg.obtained += m.marksObtained;
        agg.total += m.maxMarks;
        const pct = m.maxMarks > 0 ? (m.marksObtained * 10_000) / m.maxMarks : 0;
        if (pct < 3300) agg.failedSubjectIds.push(m.subjectId);
        byStudent.set(m.studentId, agg);
      }

      // Rank within section: sort by percentage desc, dense rank stored.
      const bySection = new Map<string, Array<{ studentId: string; pct: number }>>();
      for (const [studentId, agg] of byStudent) {
        const pct = agg.total > 0 ? Math.floor((agg.obtained * 10_000) / agg.total) : 0;
        const list = bySection.get(agg.sectionId) ?? [];
        list.push({ studentId, pct });
        bySection.set(agg.sectionId, list);
      }
      const rankInSection = new Map<string, number>();
      for (const [, list] of bySection) {
        list.sort((a, b) => b.pct - a.pct);
        let rank = 0;
        let prevPct = -1;
        list.forEach((item, i) => {
          if (item.pct !== prevPct) {
            rank = i + 1;
            prevPct = item.pct;
          }
          rankInSection.set(item.studentId, rank);
        });
      }

      let count = 0;
      for (const [studentId, agg] of byStudent) {
        const percentageBp =
          agg.total > 0 ? Math.floor((agg.obtained * 10_000) / agg.total) : 0;
        const grade =
          bands.find(
            (b) =>
              percentageBp >= b.minPercentageBp && percentageBp <= b.maxPercentageBp,
          )?.grade ?? null;

        let status: 'pass' | 'fail' | 'compartment' | 'absent' = 'pass';
        if (agg.absent && agg.total === 0) status = 'absent';
        else if (agg.failedSubjectIds.length >= 3) status = 'fail';
        else if (agg.failedSubjectIds.length > 0) status = 'compartment';

        await tx
          .insert(results)
          .values({
            tenantId: job.tenantId,
            studentId,
            academicSessionId: exam.academicSessionId,
            termId: exam.termId,
            examId: job.examId,
            totalMarks: agg.total,
            obtainedMarks: agg.obtained,
            percentageBp,
            grade,
            rankInSection: rankInSection.get(studentId) ?? null,
            status,
            failedSubjectIds: agg.failedSubjectIds,
            isPublished: exam.isPublished,
            publishedAt: exam.isPublished ? new Date() : null,
            createdBy: job.userId,
            updatedBy: job.userId,
          })
          .onConflictDoUpdate({
            target: [results.studentId, results.examId],
            set: {
              totalMarks: agg.total,
              obtainedMarks: agg.obtained,
              percentageBp,
              grade,
              rankInSection: rankInSection.get(studentId) ?? null,
              status,
              failedSubjectIds: agg.failedSubjectIds,
              updatedAt: new Date(),
              updatedBy: job.userId,
            },
          });
        count += 1;
      }

      return { students: count };
    });
  }

  async getResults(
    studentId: string,
    grant: GrantedPermission,
    opts: { academicSessionId?: string; examId?: string } = {},
  ) {
    assertInScope(grant, { studentId });
    const isParent = grant.scope === 'self';

    return this.db.run(async (tx) => {
      const rows = await tx
        .select({
          id: results.id,
          examId: results.examId,
          examName: exams.name,
          academicSessionId: results.academicSessionId,
          termId: results.termId,
          totalMarks: results.totalMarks,
          obtainedMarks: results.obtainedMarks,
          percentageBp: results.percentageBp,
          grade: results.grade,
          rankInSection: results.rankInSection,
          status: results.status,
          isPublished: results.isPublished,
          examIsPublished: exams.isPublished,
          reportCardPath: results.reportCardPath,
        })
        .from(results)
        .innerJoin(exams, eq(exams.id, results.examId))
        .where(
          and(
            eq(results.studentId, studentId),
            opts.academicSessionId
              ? eq(results.academicSessionId, opts.academicSessionId)
              : undefined,
            opts.examId ? eq(results.examId, opts.examId) : undefined,
            // Parents cannot see marks before isPublished — explicit gate.
            isParent
              ? and(eq(results.isPublished, true), eq(exams.isPublished, true))
              : undefined,
          ),
        )
        .orderBy(desc(results.createdAt))
        .limit(50);

      // Subject marks only when published for parents
      const examIds = rows.map((r) => r.examId).filter(Boolean) as string[];
      let markRows: Array<{
        examId: string;
        subjectId: string;
        marksObtained: number | null;
        maxMarks: number;
        grade: string | null;
        isAbsent: boolean;
      }> = [];

      if (examIds.length > 0) {
        markRows = await tx
          .select({
            examId: marks.examId,
            subjectId: marks.subjectId,
            marksObtained: marks.marksObtained,
            maxMarks: marks.maxMarks,
            grade: marks.grade,
            isAbsent: marks.isAbsent,
          })
          .from(marks)
          .where(
            and(eq(marks.studentId, studentId), inArray(marks.examId, examIds)),
          );
      }

      const marksByExam = new Map<string, typeof markRows>();
      for (const m of markRows) {
        const list = marksByExam.get(m.examId) ?? [];
        list.push(m);
        marksByExam.set(m.examId, list);
      }

      return {
        data: rows.map((r) => ({
          id: r.id,
          examId: r.examId,
          examName: r.examName,
          academicSessionId: r.academicSessionId,
          termId: r.termId,
          totalMarks: r.totalMarks,
          obtainedMarks: r.obtainedMarks,
          percentageBp: r.percentageBp,
          grade: r.grade,
          rankInSection: r.rankInSection,
          status: r.status,
          reportCardPath: r.reportCardPath,
          subjects: marksByExam.get(r.examId!) ?? [],
        })),
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Report cards
  // ---------------------------------------------------------------------------

  async listReportCardTemplates() {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) =>
      tx
        .select({
          id: reportCardTemplates.id,
          name: reportCardTemplates.name,
          format: reportCardTemplates.format,
          appliesToClassIds: reportCardTemplates.appliesToClassIds,
          isDefault: reportCardTemplates.isDefault,
          isActive: reportCardTemplates.isActive,
        })
        .from(reportCardTemplates)
        .where(
          and(
            eq(reportCardTemplates.branchId, ctx.branchId!),
            eq(reportCardTemplates.isActive, true),
          ),
        ),
    );
  }

  async createReportCardTemplate(dto: CreateReportCardTemplateDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [row] = await tx
        .insert(reportCardTemplates)
        .values({
          tenantId: ctx.tenantId!,
          branchId: ctx.branchId!,
          name: dto.name,
          format: dto.format ?? 'cbse_standard',
          appliesToClassIds: dto.appliesToClassIds ?? [],
          layout: dto.layout ?? { version: 1, pages: ['marks'] },
          isDefault: dto.isDefault ?? false,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({
          id: reportCardTemplates.id,
          name: reportCardTemplates.name,
        });
      return row;
    });
  }

  async generateReportCards(dto: GenerateReportCardsDto) {
    const ctx = RequestContextStore.get();

    const studentIds = await this.db.run(async (tx) => {
      await this.requireExam(tx, dto.examId);
      const rows = await tx
        .select({ studentId: studentEnrollments.studentId })
        .from(studentEnrollments)
        .where(
          and(
            inArray(studentEnrollments.sectionId, dto.sectionIds),
            inArray(studentEnrollments.status, ['active', 'admitted', 'on_leave']),
          ),
        );
      return rows.map((r) => r.studentId);
    });

    // Chunk 50 — 900 PDFs in one job OOMs a 2 GB container.
    const chunks: string[][] = [];
    for (let i = 0; i < studentIds.length; i += REPORT_CARD_CHUNK) {
      chunks.push(studentIds.slice(i, i + REPORT_CARD_CHUNK));
    }

    const jobIds = await this.queue.enqueueReportCardChunks(
      chunks.map((ids, chunkIndex) => ({
        tenantId: ctx.tenantId!,
        branchId: ctx.branchId!,
        examId: dto.examId,
        templateId: dto.templateId ?? null,
        studentIds: ids,
        chunkIndex,
        userId: ctx.userId,
      })),
    );

    // Inline first chunk so small schools see results without a worker.
    if (chunks[0]) {
      await this.generateReportCardChunk({
        tenantId: ctx.tenantId!,
        branchId: ctx.branchId!,
        examId: dto.examId,
        templateId: dto.templateId ?? null,
        studentIds: chunks[0],
        chunkIndex: 0,
        userId: ctx.userId,
      });
    }

    return {
      jobId: jobIds[0] ?? `rc-${dto.examId}-0`,
      jobIds,
      estimatedCount: studentIds.length,
      chunkCount: chunks.length,
      chunkSize: REPORT_CARD_CHUNK,
    };
  }

  async generateReportCardChunk(job: {
    tenantId: string;
    branchId: string;
    examId: string;
    templateId: string | null;
    studentIds: string[];
    chunkIndex: number;
    userId: string | null;
  }): Promise<{ generated: number }> {
    return this.db.asTenant(job.tenantId, async (tx) => {
      let generated = 0;
      for (const studentId of job.studentIds) {
        // Placeholder path — real PDF render belongs in a worker with headless
        // Chromium; storing the intended object key keeps the API lean.
        const path = `t/${job.tenantId}/report-cards/${job.examId}/${studentId}.pdf`;
        await tx
          .update(results)
          .set({
            reportCardPath: path,
            updatedAt: new Date(),
            updatedBy: job.userId,
          })
          .where(
            and(eq(results.studentId, studentId), eq(results.examId, job.examId)),
          );
        generated += 1;
      }
      return { generated };
    });
  }

  async getReportCard(studentId: string, examId: string, grant: GrantedPermission) {
    assertInScope(grant, { studentId });
    const isParent = grant.scope === 'self';

    return this.db.run(async (tx) => {
      const [row] = await tx
        .select({
          reportCardPath: results.reportCardPath,
          isPublished: results.isPublished,
          examIsPublished: exams.isPublished,
        })
        .from(results)
        .innerJoin(exams, eq(exams.id, results.examId))
        .where(and(eq(results.studentId, studentId), eq(results.examId, examId)))
        .limit(1);

      if (!row) throw new ApiException(404, 'NOT_FOUND', 'Report card not found');
      if (isParent && (!row.isPublished || !row.examIsPublished)) {
        throw new ApiException(
          403,
          'NOT_PUBLISHED',
          'Results have not been published yet.',
        );
      }
      if (!row.reportCardPath) {
        throw new ApiException(404, 'NOT_READY', 'Report card PDF is not ready yet.');
      }

      // Signed URL stub — StorageService lands with the files module.
      const base = this.config.getOrThrow<string>('FILES_BASE_URL');
      return {
        studentId,
        examId,
        path: row.reportCardPath,
        url: `${base}/${row.reportCardPath}`,
        expiresInSeconds: 900,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // HPC
  // ---------------------------------------------------------------------------

  async listHpcDomains() {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) =>
      tx
        .select({
          id: hpcDomains.id,
          code: hpcDomains.code,
          name: hpcDomains.name,
          description: hpcDomains.description,
          stage: hpcDomains.stage,
          sequence: hpcDomains.sequence,
        })
        .from(hpcDomains)
        .where(and(eq(hpcDomains.branchId, ctx.branchId!), eq(hpcDomains.isActive, true)))
        .orderBy(asc(hpcDomains.sequence)),
    );
  }

  async createHpcDomain(dto: CreateHpcDomainDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [row] = await tx
        .insert(hpcDomains)
        .values({
          tenantId: ctx.tenantId!,
          branchId: ctx.branchId!,
          code: dto.code,
          name: dto.name,
          description: dto.description,
          stage: dto.stage,
          sequence: dto.sequence ?? 0,
        })
        .returning({ id: hpcDomains.id, code: hpcDomains.code, name: hpcDomains.name });
      return row;
    });
  }

  async listHpcIndicators(domainId?: string) {
    return this.db.run(async (tx) =>
      tx
        .select({
          id: hpcIndicators.id,
          domainId: hpcIndicators.domainId,
          code: hpcIndicators.code,
          statement: hpcIndicators.statement,
          levels: hpcIndicators.levels,
          sequence: hpcIndicators.sequence,
        })
        .from(hpcIndicators)
        .where(domainId ? eq(hpcIndicators.domainId, domainId) : undefined)
        .orderBy(asc(hpcIndicators.sequence))
        .limit(200),
    );
  }

  async createHpcIndicator(dto: CreateHpcIndicatorDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [row] = await tx
        .insert(hpcIndicators)
        .values({
          tenantId: ctx.tenantId!,
          domainId: dto.domainId,
          code: dto.code,
          statement: dto.statement,
          levels: dto.levels ?? ['beginner', 'progressing', 'proficient', 'advanced'],
          sequence: dto.sequence ?? 0,
        })
        .returning({
          id: hpcIndicators.id,
          code: hpcIndicators.code,
          statement: hpcIndicators.statement,
        });
      return row;
    });
  }

  async seedHpcTemplate(dto: SeedHpcTemplateDto) {
    const ctx = RequestContextStore.get();
    const stage = dto.stage ?? 'middle';
    const template = CBSE_HPC_TEMPLATE.filter(
      (d) => d.stage === stage || stage === 'middle',
    );

    return this.db.run(async (tx) => {
      let domains = 0;
      let indicators = 0;
      for (const d of template) {
        const [domain] = await tx
          .insert(hpcDomains)
          .values({
            tenantId: ctx.tenantId!,
            branchId: ctx.branchId!,
            code: d.code,
            name: d.name,
            description: d.description,
            stage: d.stage,
            sequence: d.sequence,
          })
          .onConflictDoNothing({
            target: [hpcDomains.branchId, hpcDomains.code],
          })
          .returning({ id: hpcDomains.id, code: hpcDomains.code });

        let domainId = domain?.id;
        if (!domainId) {
          const [existing] = await tx
            .select({ id: hpcDomains.id })
            .from(hpcDomains)
            .where(
              and(eq(hpcDomains.branchId, ctx.branchId!), eq(hpcDomains.code, d.code)),
            )
            .limit(1);
          domainId = existing?.id;
        } else {
          domains += 1;
        }
        if (!domainId) continue;

        for (const ind of d.indicators) {
          const [existingInd] = await tx
            .select({ id: hpcIndicators.id })
            .from(hpcIndicators)
            .where(
              and(eq(hpcIndicators.domainId, domainId), eq(hpcIndicators.code, ind.code)),
            )
            .limit(1);
          if (existingInd) continue;
          await tx.insert(hpcIndicators).values({
            tenantId: ctx.tenantId!,
            domainId,
            code: ind.code,
            statement: ind.statement,
            levels: ind.levels,
            sequence: indicators,
          });
          indicators += 1;
        }
      }
      return { domains, indicators, stage };
    });
  }

  async createHpcAssessment(dto: CreateHpcAssessmentDto, grant: GrantedPermission) {
    assertInScope(grant, { studentId: dto.studentId });
    const ctx = RequestContextStore.get();

    return this.db.run(async (tx) => {
      if (dto.clientMutationId) {
        const [existing] = await tx
          .select({
            id: hpcAssessments.id,
            level: hpcAssessments.level,
            assessorType: hpcAssessments.assessorType,
          })
          .from(hpcAssessments)
          .where(eq(hpcAssessments.clientMutationId, dto.clientMutationId))
          .limit(1);
        if (existing) return { ...existing, replayed: true };
      }

      const [row] = await tx
        .insert(hpcAssessments)
        .values({
          tenantId: ctx.tenantId!,
          studentId: dto.studentId,
          indicatorId: dto.indicatorId,
          academicSessionId: dto.academicSessionId,
          termId: dto.termId,
          assessorType: dto.assessorType,
          assessorUserId: ctx.userId,
          level: dto.level,
          observationNote: dto.observationNote,
          evidencePaths: dto.evidencePaths ?? [],
          observedOn: dto.observedOn,
          clientMutationId: dto.clientMutationId,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .onConflictDoUpdate({
          target: [
            hpcAssessments.studentId,
            hpcAssessments.indicatorId,
            hpcAssessments.termId,
            hpcAssessments.assessorType,
            hpcAssessments.assessorUserId,
          ],
          set: {
            level: dto.level,
            observationNote: dto.observationNote,
            evidencePaths: dto.evidencePaths ?? [],
            observedOn: dto.observedOn,
            updatedAt: new Date(),
            updatedBy: ctx.userId,
          },
        })
        .returning({
          id: hpcAssessments.id,
          level: hpcAssessments.level,
          assessorType: hpcAssessments.assessorType,
        });

      return { ...row, replayed: false };
    });
  }

  async getHpcStudent(
    studentId: string,
    grant: GrantedPermission,
    opts: { termId?: string; academicSessionId?: string } = {},
  ) {
    assertInScope(grant, { studentId });
    return this.db.run(async (tx) => {
      const rows = await tx
        .select({
          id: hpcAssessments.id,
          indicatorId: hpcAssessments.indicatorId,
          indicatorCode: hpcIndicators.code,
          statement: hpcIndicators.statement,
          domainId: hpcIndicators.domainId,
          domainName: hpcDomains.name,
          termId: hpcAssessments.termId,
          assessorType: hpcAssessments.assessorType,
          level: hpcAssessments.level,
          observationNote: hpcAssessments.observationNote,
          evidencePaths: hpcAssessments.evidencePaths,
          observedOn: hpcAssessments.observedOn,
        })
        .from(hpcAssessments)
        .innerJoin(hpcIndicators, eq(hpcIndicators.id, hpcAssessments.indicatorId))
        .innerJoin(hpcDomains, eq(hpcDomains.id, hpcIndicators.domainId))
        .where(
          and(
            eq(hpcAssessments.studentId, studentId),
            opts.termId ? eq(hpcAssessments.termId, opts.termId) : undefined,
            opts.academicSessionId
              ? eq(hpcAssessments.academicSessionId, opts.academicSessionId)
              : undefined,
          ),
        )
        .orderBy(asc(hpcDomains.sequence), asc(hpcIndicators.sequence));

      // Group by indicator so teacher/self/peer/parent sit side by side.
      const byIndicator = new Map<
        string,
        {
          indicatorId: string;
          code: string;
          statement: string;
          domainId: string;
          domainName: string;
          assessments: Array<{
            id: string;
            assessorType: string;
            level: string | null;
            observationNote: string | null;
            evidencePaths: string[] | null;
            observedOn: string | null;
          }>;
        }
      >();

      for (const r of rows) {
        const g = byIndicator.get(r.indicatorId) ?? {
          indicatorId: r.indicatorId,
          code: r.indicatorCode,
          statement: r.statement,
          domainId: r.domainId,
          domainName: r.domainName ?? '',
          assessments: [],
        };
        g.assessments.push({
          id: r.id,
          assessorType: r.assessorType,
          level: r.level,
          observationNote: r.observationNote,
          evidencePaths: r.evidencePaths,
          observedOn: r.observedOn,
        });
        byIndicator.set(r.indicatorId, g);
      }

      return { studentId, indicators: [...byIndicator.values()] };
    });
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async requireExam(tx: Tx, examId: string) {
    const [exam] = await tx
      .select({
        id: exams.id,
        isPublished: exams.isPublished,
        isTimetablePublished: exams.isTimetablePublished,
        academicSessionId: exams.academicSessionId,
      })
      .from(exams)
      .where(eq(exams.id, examId))
      .limit(1);
    if (!exam) throw new ApiException(404, 'NOT_FOUND', 'Exam not found');
    return exam;
  }
}

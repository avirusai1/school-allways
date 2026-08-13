import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import {
  academicSessions,
  classSubjects,
  classes,
  sections,
  subjects,
  terms,
} from '@saw/db';
import { RequestContextStore } from '../../common/context/request-context';
import { TenantDbService } from '../../common/database/tenant-db.service';
import { AcademicRepository } from './academic.repository';
import { ensureStayConnectedFee } from '../subscriptions/stay-connected.util';
import { commitRollover, previewRollover } from './academic.rollover';
import {
  CBSE_TERMS,
  classesForBoard,
  subjectsForBoard,
} from './board-templates';
import type {
  ApplyTemplateDto,
  BatchSaveClassesDto,
  BatchSaveSubjectsDto,
  CreateClassDto,
  CreateSectionDto,
  CreateSessionDto,
  CreateSubjectDto,
  RolloverDto,
} from './dto/academic.dto';

@Injectable()
export class AcademicService {
  constructor(
    private readonly db: TenantDbService,
    private readonly repo: AcademicRepository,
  ) {}

  listSessions(branchId: string) {
    return this.db.run((tx) => this.repo.listSessions(tx, branchId));
  }

  createSession(dto: CreateSessionDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      if (dto.isCurrent) {
        await tx
          .update(academicSessions)
          .set({ isCurrent: false })
          .where(eq(academicSessions.branchId, dto.branchId));
      }

      const [created] = await tx
        .insert(academicSessions)
        .values({
          tenantId: ctx.tenantId!,
          branchId: dto.branchId,
          name: dto.name,
          startDate: dto.startDate,
          endDate: dto.endDate,
          isCurrent: dto.isCurrent ?? false,
          createdBy: ctx.userId,
        })
        .returning({
          id: academicSessions.id,
          name: academicSessions.name,
          isCurrent: academicSessions.isCurrent,
          endDate: academicSessions.endDate,
        });

      if (created?.isCurrent) {
        await ensureStayConnectedFee(tx, {
          tenantId: ctx.tenantId!,
          academicSessionId: created.id,
          sessionName: created.name,
          sessionEndDate: created.endDate,
          userId: ctx.userId,
        });
      }

      return created;
    });
  }

  listClasses(branchId: string) {
    return this.db.run((tx) => this.repo.listClasses(tx, branchId));
  }

  createClass(dto: CreateClassDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [created] = await this.repo.insertClass(tx, {
        tenantId: ctx.tenantId!,
        branchId: dto.branchId,
        name: dto.name,
        level: dto.level,
        stage: dto.stage ?? null,
        stream: dto.stream ?? null,
        createdBy: ctx.userId,
      });
      return created;
    });
  }

  listSections(branchId: string, academicSessionId?: string) {
    return this.db.run((tx) => this.repo.listSections(tx, branchId, academicSessionId));
  }

  createSection(dto: CreateSectionDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [created] = await tx
        .insert(sections)
        .values({
          tenantId: ctx.tenantId!,
          branchId: dto.branchId,
          classId: dto.classId,
          academicSessionId: dto.academicSessionId,
          name: dto.name,
          capacity: dto.capacity ?? null,
        })
        .returning({ id: sections.id, name: sections.name });
      return created;
    });
  }

  listSubjects(branchId: string) {
    return this.db.run((tx) => this.repo.listSubjects(tx, branchId));
  }

  listClassSubjectLinks(academicSessionId: string) {
    return this.db.run((tx) => this.repo.listClassSubjectLinks(tx, academicSessionId));
  }

  createSubject(dto: CreateSubjectDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [created] = await this.repo.insertSubject(tx, {
        tenantId: ctx.tenantId!,
        branchId: dto.branchId,
        code: dto.code,
        name: dto.name,
        type: dto.type ?? 'core',
        isScholastic: dto.isScholastic ?? true,
        createdBy: ctx.userId,
      });
      return created;
    });
  }

  /** One request for the whole classes editor — never one POST per row. */
  batchSaveClasses(dto: BatchSaveClassesDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      let classesUpserted = 0;
      let sectionsCreated = 0;

      for (const row of dto.classes) {
        let classId = row.id;
        if (classId) {
          await tx
            .update(classes)
            .set({
              name: row.name,
              level: row.level,
              stage: row.stage ?? null,
              stream: row.stream ?? null,
            })
            .where(eq(classes.id, classId));
        } else {
          const existing = await this.repo.classExists(
            tx,
            dto.branchId,
            row.name,
            row.stream,
          );
          if (existing) {
            classId = existing.id;
            await tx
              .update(classes)
              .set({
                level: row.level,
                stage: row.stage ?? null,
                stream: row.stream ?? null,
              })
              .where(eq(classes.id, classId));
          } else {
            classId = randomUUID();
            await tx.insert(classes).values({
              id: classId,
              tenantId: ctx.tenantId!,
              branchId: dto.branchId,
              name: row.name,
              level: row.level,
              stage: row.stage ?? null,
              stream: row.stream ?? null,
            });
          }
        }
        classesUpserted += 1;

        const existingSections = await tx
          .select({ id: sections.id, name: sections.name })
          .from(sections)
          .where(
            and(
              eq(sections.classId, classId),
              eq(sections.academicSessionId, dto.academicSessionId),
            ),
          );
        const byName = new Map(existingSections.map((s) => [s.name, s.id]));

        for (const sec of row.sections) {
          const existingId = byName.get(sec.name);
          if (existingId) {
            await tx
              .update(sections)
              .set({ capacity: sec.capacity ?? null })
              .where(eq(sections.id, existingId));
          } else {
            await tx.insert(sections).values({
              tenantId: ctx.tenantId!,
              branchId: dto.branchId,
              classId,
              academicSessionId: dto.academicSessionId,
              name: sec.name,
              capacity: sec.capacity ?? null,
            });
            sectionsCreated += 1;
          }
        }
      }

      return { classesUpserted, sectionsCreated };
    });
  }

  batchSaveSubjects(dto: BatchSaveSubjectsDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      let subjectsUpserted = 0;
      let linksWritten = 0;

      for (const row of dto.subjects) {
        let subjectId = row.id;
        if (subjectId) {
          await tx
            .update(subjects)
            .set({
              code: row.code,
              name: row.name,
              type: row.type,
              isScholastic: row.isScholastic,
            })
            .where(eq(subjects.id, subjectId));
        } else {
          const existing = await this.repo.subjectExists(tx, dto.branchId, row.code);
          if (existing) {
            subjectId = existing.id;
            await tx
              .update(subjects)
              .set({
                name: row.name,
                type: row.type,
                isScholastic: row.isScholastic,
              })
              .where(eq(subjects.id, subjectId));
          } else {
            subjectId = randomUUID();
            await tx.insert(subjects).values({
              id: subjectId,
              tenantId: ctx.tenantId!,
              branchId: dto.branchId,
              code: row.code,
              name: row.name,
              type: row.type,
              isScholastic: row.isScholastic,
            });
          }
        }
        subjectsUpserted += 1;

        await tx
          .delete(classSubjects)
          .where(
            and(
              eq(classSubjects.subjectId, subjectId),
              eq(classSubjects.academicSessionId, dto.academicSessionId),
            ),
          );

        if (row.classIds.length > 0) {
          await tx.insert(classSubjects).values(
            row.classIds.map((classId) => ({
              tenantId: ctx.tenantId!,
              classId,
              subjectId: subjectId!,
              academicSessionId: dto.academicSessionId,
            })),
          );
          linksWritten += row.classIds.length;
        }
      }

      return { subjectsUpserted, linksWritten };
    });
  }

  rollover(sessionId: string, dto: RolloverDto, dryRun: boolean) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      if (dryRun) {
        return previewRollover(tx, sessionId, dto);
      }
      const result = await commitRollover(tx, sessionId, dto, ctx.userId ?? null);
      RequestContextStore.addAudit({
        action: 'academic.session.rollover',
        entityType: 'academic_sessions',
        entityId: sessionId,
        changes: {
          targetSessionId: { from: null, to: result.targetSessionId },
          wouldPromote: { from: null, to: result.wouldPromote },
        },
      });
      return result;
    });
  }

  listCalendar(academicSessionId: string) {
    return this.db.run((tx) => this.repo.listCalendar(tx, academicSessionId));
  }

  async applyTemplate(dto: ApplyTemplateDto) {
    const ctx = RequestContextStore.get();
    let classesCreated = 0;
    let subjectsCreated = 0;
    let termsCreated = 0;

    await this.db.run(async (tx) => {
      if (dto.include.includes('classes')) {
        const templateClasses = classesForBoard(
          dto.board,
          dto.fromClassLevel,
          dto.toClassLevel,
        );
        for (const cls of templateClasses) {
          const existing = await this.repo.classExists(tx, dto.branchId, cls.name);
          if (existing) continue;
          await this.repo.insertClass(tx, {
            tenantId: ctx.tenantId!,
            branchId: dto.branchId,
            name: cls.name,
            level: cls.level,
            stage: cls.stage,
            createdBy: ctx.userId,
          });
          classesCreated++;
        }
      }

      if (dto.include.includes('subjects')) {
        for (const subj of subjectsForBoard(dto.board)) {
          const existing = await this.repo.subjectExists(tx, dto.branchId, subj.code);
          if (existing) continue;
          await this.repo.insertSubject(tx, {
            tenantId: ctx.tenantId!,
            branchId: dto.branchId,
            code: subj.code,
            name: subj.name,
            type: subj.type,
            createdBy: ctx.userId,
          });
          subjectsCreated++;
        }
      }

      if (dto.include.includes('terms')) {
        const [session] = await tx
          .select({
            startDate: academicSessions.startDate,
            endDate: academicSessions.endDate,
          })
          .from(academicSessions)
          .where(eq(academicSessions.id, dto.academicSessionId))
          .limit(1);

        // Onboarding step 2 already creates terms for the session, so a later
        // template apply would collide on terms_session_seq_uq and surface as
        // a bare 500. Re-applying a template must stay safe.
        const [existingTerm] = await tx
          .select({ id: terms.id })
          .from(terms)
          .where(eq(terms.academicSessionId, dto.academicSessionId))
          .limit(1);

        if (session && !existingTerm) {
          const midYear = new Date(session.startDate);
          midYear.setMonth(midYear.getMonth() + 5);
          const mid = midYear.toISOString().slice(0, 10);

          for (const term of CBSE_TERMS) {
            await this.repo.insertTerm(tx, {
              tenantId: ctx.tenantId!,
              academicSessionId: dto.academicSessionId,
              name: term.name,
              type: term.type,
              sequence: term.sequence,
              startDate: term.sequence === 1 ? session.startDate : mid,
              endDate: term.sequence === 1 ? mid : session.endDate,
            });
            termsCreated++;
          }
        }
      }
    });

    RequestContextStore.addAudit({
      action: 'academic.template_applied',
      entityType: 'branches',
      entityId: dto.branchId,
      changes: {
        board: { from: null, to: dto.board },
        classesCreated: { from: null, to: classesCreated },
      },
    });

    return { classesCreated, subjectsCreated, termsCreated };
  }
}

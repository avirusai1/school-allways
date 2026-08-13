/**
 * Year rollover preview + commit.
 * Never rewrites last year's marks/attendance — only links promoted_to on
 * source enrollments and creates new session / section / enrollment rows.
 */

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import {
  academicSessions,
  classes,
  invoices,
  sections,
  studentEnrollments,
} from '@saw/db';
import type { Tx } from '../../common/database/tenant-db.service';
import type { RolloverDto } from './dto/academic.dto';

export type UnpaidDuesWarning = {
  type: 'unpaid_dues';
  count: number;
  totalPaise: number;
  /** Capped at 50 — UI can deep-link; do not dump thousands of UUIDs. */
  studentIds: string[];
};

export type RolloverWarning = string | UnpaidDuesWarning;

export type RolloverPreview = {
  wouldCreate: { classes: number; sections: number; enrollments: number };
  wouldPromote: number;
  wouldDetain: number;
  wouldGraduate: number;
  warnings: RolloverWarning[];
  targetSessionId?: string;
};

type ClassRow = { id: string; name: string; level: number; stream: string | null };
type SectionRow = {
  id: string;
  name: string;
  classId: string;
  capacity: number | null;
};
type EnrollmentRow = {
  id: string;
  studentId: string;
  classId: string;
  sectionId: string | null;
  rollNo: string | null;
  house: string | null;
  status: string;
  promotedToEnrollmentId: string | null;
};

function nextLevel(level: number): number | null {
  if (level === -3) return -2;
  if (level === -2) return -1;
  if (level === -1) return 1;
  if (level >= 1 && level < 12) return level + 1;
  return null;
}

function defaultDates(sourceStart: string, sourceEnd: string) {
  const start = new Date(sourceStart);
  const end = new Date(sourceEnd);
  start.setFullYear(start.getFullYear() + 1);
  end.setFullYear(end.getFullYear() + 1);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

async function loadSource(tx: Tx, sessionId: string) {
  const [session] = await tx
    .select({
      id: academicSessions.id,
      tenantId: academicSessions.tenantId,
      branchId: academicSessions.branchId,
      name: academicSessions.name,
      startDate: academicSessions.startDate,
      endDate: academicSessions.endDate,
    })
    .from(academicSessions)
    .where(eq(academicSessions.id, sessionId))
    .limit(1);

  if (!session?.branchId) {
    throw new NotFoundException('Academic session not found.');
  }

  const classRows = await tx
    .select({
      id: classes.id,
      name: classes.name,
      level: classes.level,
      stream: classes.stream,
    })
    .from(classes)
    .where(and(eq(classes.branchId, session.branchId), eq(classes.isActive, true)));

  const sectionRows = await tx
    .select({
      id: sections.id,
      name: sections.name,
      classId: sections.classId,
      capacity: sections.capacity,
    })
    .from(sections)
    .where(
      and(eq(sections.academicSessionId, sessionId), eq(sections.isActive, true)),
    );

  const enrollments = await tx
    .select({
      id: studentEnrollments.id,
      studentId: studentEnrollments.studentId,
      classId: studentEnrollments.classId,
      sectionId: studentEnrollments.sectionId,
      rollNo: studentEnrollments.rollNo,
      house: studentEnrollments.house,
      status: studentEnrollments.status,
      promotedToEnrollmentId: studentEnrollments.promotedToEnrollmentId,
    })
    .from(studentEnrollments)
    .where(
      and(
        eq(studentEnrollments.academicSessionId, sessionId),
        eq(studentEnrollments.status, 'active'),
        isNull(studentEnrollments.deletedAt),
      ),
    );

  return { session, classRows, sectionRows, enrollments };
}

function planRollover(
  classRows: ClassRow[],
  sectionRows: SectionRow[],
  enrollments: EnrollmentRow[],
  dto: RolloverDto,
) {
  const byId = new Map(classRows.map((c) => [c.id, c]));
  const byLevelStream = new Map(
    classRows.map((c) => [`${c.level}|${c.stream ?? ''}`, c]),
  );

  const graduatingLevel = dto.promotionRules.graduatingClassLevel ?? 12;
  const detained = new Set(dto.promotionRules.detained ?? []);
  const warnings: RolloverWarning[] = [];
  let wouldPromote = 0;
  let wouldDetain = 0;
  let wouldGraduate = 0;
  let noSection = 0;

  const actions: Array<{
    source: EnrollmentRow;
    kind: 'promote' | 'detain' | 'graduate';
    targetClassId: string | null;
    targetSectionName: string | null;
  }> = [];

  for (const en of enrollments) {
    if (en.promotedToEnrollmentId) continue;
    const cls = byId.get(en.classId);
    if (!cls) {
      warnings.push(`Enrollment ${en.id.slice(0, 8)}… has no class — skipped`);
      continue;
    }
    if (!en.sectionId) noSection += 1;

    const sourceSection = sectionRows.find((s) => s.id === en.sectionId);
    const sectionName = sourceSection?.name ?? 'A';

    if (cls.level >= graduatingLevel) {
      wouldGraduate += 1;
      actions.push({
        source: en,
        kind: 'graduate',
        targetClassId: null,
        targetSectionName: null,
      });
      continue;
    }

    const detain =
      detained.has(en.studentId) || dto.promotionRules.defaultAction === 'detain';

    if (detain) {
      wouldDetain += 1;
      actions.push({
        source: en,
        kind: 'detain',
        targetClassId: cls.id,
        targetSectionName: sectionName,
      });
      continue;
    }

    const nl = nextLevel(cls.level);
    if (nl == null) {
      wouldGraduate += 1;
      actions.push({
        source: en,
        kind: 'graduate',
        targetClassId: null,
        targetSectionName: null,
      });
      continue;
    }

    const target = byLevelStream.get(`${nl}|${cls.stream ?? ''}`);
    if (!target) {
      warnings.push(
        `No class at level ${nl} for ${cls.name} — student cannot promote`,
      );
      continue;
    }

    wouldPromote += 1;
    actions.push({
      source: en,
      kind: 'promote',
      targetClassId: target.id,
      targetSectionName: sectionName,
    });
  }

  if (noSection > 0) {
    warnings.push(
      `${noSection} student${noSection === 1 ? ' has' : 's have'} no section assigned`,
    );
  }

  return {
    preview: {
      wouldCreate: {
        classes: new Set(sectionRows.map((s) => s.classId)).size,
        sections: sectionRows.length,
        enrollments: wouldPromote + wouldDetain,
      },
      wouldPromote,
      wouldDetain,
      wouldGraduate,
      warnings,
    } satisfies RolloverPreview,
    actions,
  };
}

/**
 * One grouped query for all promotees — never N+1 per student (docs/06 §2.1).
 * Uses invoices.balance_paise (net − paid) for the source session.
 */
export async function unpaidDuesWarning(
  tx: Tx,
  academicSessionId: string,
  promoteStudentIds: string[],
): Promise<UnpaidDuesWarning | null> {
  if (promoteStudentIds.length === 0) return null;

  const rows = await tx
    .select({
      studentId: invoices.studentId,
      totalPaise: sql<number>`coalesce(sum(${invoices.balancePaise}), 0)`.mapWith(Number),
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.academicSessionId, academicSessionId),
        inArray(invoices.studentId, promoteStudentIds),
        sql`${invoices.status} NOT IN ('cancelled', 'waived', 'draft')`,
        sql`${invoices.balancePaise} > 0`,
      ),
    )
    .groupBy(invoices.studentId);

  const withBalance = rows.filter((r) => r.totalPaise > 0);
  if (withBalance.length === 0) return null;

  const totalPaise = withBalance.reduce((s, r) => s + r.totalPaise, 0);
  return {
    type: 'unpaid_dues',
    count: withBalance.length,
    totalPaise,
    studentIds: withBalance.slice(0, 50).map((r) => r.studentId),
  };
}

export async function previewRollover(
  tx: Tx,
  sessionId: string,
  dto: RolloverDto,
): Promise<RolloverPreview> {
  const { classRows, sectionRows, enrollments } = await loadSource(tx, sessionId);
  const { preview, actions } = planRollover(classRows, sectionRows, enrollments, dto);
  const promoteIds = actions
    .filter((a) => a.kind === 'promote')
    .map((a) => a.source.studentId);
  const unpaid = await unpaidDuesWarning(tx, sessionId, promoteIds);
  if (unpaid) preview.warnings.push(unpaid);
  return preview;
}

export async function commitRollover(
  tx: Tx,
  sessionId: string,
  dto: RolloverDto,
  actorUserId: string | null,
): Promise<RolloverPreview & { targetSessionId: string }> {
  const { session, classRows, sectionRows, enrollments } = await loadSource(tx, sessionId);
  const { preview, actions } = planRollover(classRows, sectionRows, enrollments, dto);

  if (!dto.targetSessionName.trim()) {
    throw new BadRequestException('Target session name is required.');
  }

  const dates = defaultDates(session.startDate, session.endDate);
  const startDate = dto.targetStartDate ?? dates.startDate;
  const endDate = dto.targetEndDate ?? dates.endDate;

  const [existingTarget] = await tx
    .select({ id: academicSessions.id })
    .from(academicSessions)
    .where(
      and(
        eq(academicSessions.branchId, session.branchId!),
        eq(academicSessions.name, dto.targetSessionName.trim()),
      ),
    )
    .limit(1);

  let targetSessionId = existingTarget?.id;
  if (!targetSessionId) {
    targetSessionId = randomUUID();
    await tx.insert(academicSessions).values({
      id: targetSessionId,
      tenantId: session.tenantId,
      branchId: session.branchId,
      name: dto.targetSessionName.trim(),
      startDate,
      endDate,
      isCurrent: false,
      createdBy: actorUserId,
    });
  } else {
    const pending = actions.filter((a) => !a.source.promotedToEnrollmentId);
    if (pending.length === 0 && actions.length > 0) {
      throw new ConflictException(
        'This session has already been rolled over into the target year.',
      );
    }
  }

  const sectionKeyToId = new Map<string, string>();
  const existingTargetSections = await tx
    .select({
      id: sections.id,
      classId: sections.classId,
      name: sections.name,
    })
    .from(sections)
    .where(eq(sections.academicSessionId, targetSessionId));

  for (const s of existingTargetSections) {
    sectionKeyToId.set(`${s.classId}|${s.name}`, s.id);
  }

  const newSections = sectionRows.filter(
    (s) => !sectionKeyToId.has(`${s.classId}|${s.name}`),
  );
  if (newSections.length > 0) {
    const ids = newSections.map(() => randomUUID());
    await tx.insert(sections).values(
      newSections.map((s, i) => ({
        id: ids[i]!,
        tenantId: session.tenantId,
        branchId: session.branchId!,
        classId: s.classId,
        academicSessionId: targetSessionId!,
        name: s.name,
        capacity: s.capacity,
      })),
    );
    newSections.forEach((s, i) => {
      sectionKeyToId.set(`${s.classId}|${s.name}`, ids[i]!);
    });
  }

  const carryRoll = dto.carryForward?.rollNumbers ?? false;
  const carryHouse = dto.carryForward?.houses ?? true;

  const toInsert: Array<{
    id: string;
    sourceId: string;
    studentId: string;
    classId: string;
    sectionId: string | null;
    rollNo: string | null;
    house: string | null;
  }> = [];

  for (const action of actions) {
    if (action.kind === 'graduate') continue;
    if (action.source.promotedToEnrollmentId) continue;
    if (!action.targetClassId || !action.targetSectionName) continue;

    const sectionId =
      sectionKeyToId.get(`${action.targetClassId}|${action.targetSectionName}`) ??
      sectionKeyToId.get(`${action.targetClassId}|A`) ??
      null;

    toInsert.push({
      id: randomUUID(),
      sourceId: action.source.id,
      studentId: action.source.studentId,
      classId: action.targetClassId,
      sectionId,
      rollNo: carryRoll ? action.source.rollNo : null,
      house: carryHouse ? action.source.house : null,
    });
  }

  const CHUNK = 500;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK);
    await tx.insert(studentEnrollments).values(
      chunk.map((r) => ({
        id: r.id,
        tenantId: session.tenantId,
        branchId: session.branchId!,
        studentId: r.studentId,
        academicSessionId: targetSessionId!,
        classId: r.classId,
        sectionId: r.sectionId,
        rollNo: r.rollNo,
        house: r.house,
        status: 'active' as const,
        createdBy: actorUserId,
      })),
    );

    // One statement per chunk — not N updates.
    const valuesSql = sql.join(
      chunk.map((r) => sql`(${r.sourceId}::uuid, ${r.id}::uuid)`),
      sql`, `,
    );
    await tx.execute(sql`
      UPDATE student_enrollments AS e
      SET promoted_to_enrollment_id = v.new_id
      FROM (VALUES ${valuesSql}) AS v(source_id, new_id)
      WHERE e.id = v.source_id
    `);
  }

  const graduateIds = actions
    .filter((a) => a.kind === 'graduate' && !a.source.promotedToEnrollmentId)
    .map((a) => a.source.id);

  if (graduateIds.length > 0) {
    for (let i = 0; i < graduateIds.length; i += CHUNK) {
      const chunk = graduateIds.slice(i, i + CHUNK);
      await tx
        .update(studentEnrollments)
        .set({ status: 'passed_out', leftOn: session.endDate })
        .where(inArray(studentEnrollments.id, chunk));
    }
  }

  return { ...preview, targetSessionId: targetSessionId! };
}

/**
 * Chunked import commit — 500 rows per transaction, ~4 statements per chunk
 * (not ~2,000). Every inserted row carries import_batch_id for O(1) undo.
 */

import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { randomUUID } from 'node:crypto';

import {
  academicSessions,
  classes,
  guardians,
  importBatches,
  roles,
  sections,
  staff,
  studentEnrollments,
  studentGuardians,
  students,
  userRoleAssignments,
  userTenantMemberships,
  users,
} from '@saw/db';
import { StorageService } from '../../../common/storage/storage.service';
import { TenantDbService, type Tx } from '../../../common/database/tenant-db.service';
import { REDIS_CLIENT } from '../../../common/redis/redis.constants';
import { IMPORT_COMMIT_QUEUE } from '../import-queue.service';
import type { ColumnMapping, ImportCommitJob, ValidationResult } from '../import.types';
import { parseImportFile } from '../parsers/csv.parser';
import { mapStaffRow } from '../validators/staff.validator';
import { mapStudentRow } from '../validators/student.validator';

const CHUNK_SIZE = 500;

/** Used only when the file carries a phone but no name for the person. */
function fallbackName(kind: 'staff' | 'guardian'): string {
  return kind === 'staff' ? 'Staff member' : 'Parent';
}

@Injectable()
export class ImportCommitService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImportCommitService.name);
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly db: TenantDbService,
    private readonly storage: StorageService,
  ) {}

  onModuleInit(): void {
    try {
      this.worker = new Worker<ImportCommitJob>(
        IMPORT_COMMIT_QUEUE,
        async (job: Job<ImportCommitJob>) => this.processCommit(job.data),
        {
          connection: this.redis.duplicate({ maxRetriesPerRequest: null }),
          concurrency: 1,
        },
      );
      this.worker.on('failed', (job, err) => {
        this.logger.error(`Import commit job ${job?.id} failed: ${err.message}`);
      });
    } catch (err) {
      this.logger.warn(
        `Import commit worker not started: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  async processCommit(job: ImportCommitJob): Promise<{ committed: number; skipped: number }> {
    const batch = await this.db.asTenant(job.tenantId, async (tx) => {
      const [row] = await tx
        .select({
          id: importBatches.id,
          tenantId: importBatches.tenantId,
          branchId: importBatches.branchId,
          entity: importBatches.entity,
          filePath: importBatches.filePath,
          columnMapping: importBatches.columnMapping,
          validationResult: importBatches.validationResult,
          committedRows: importBatches.committedRows,
        })
        .from(importBatches)
        .where(eq(importBatches.id, job.importId))
        .limit(1);
      return row ?? null;
    });

    if (!batch?.filePath) {
      throw new Error(`Import batch ${job.importId} not found or has no file`);
    }

    const validation = batch.validationResult as ValidationResult | null;
    const skipRows = new Set(
      job.partialCommit && validation?.errorRowNumbers ? validation.errorRowNumbers : [],
    );

    const parsed = await parseImportFile(this.storage.absolutePath(batch.filePath));
    const mapping = (batch.columnMapping ?? {}) as ColumnMapping;

    const rows =
      batch.entity === 'staff'
        ? parsed.rows
            .filter((r) => !skipRows.has(r.rowNumber))
            .map((r) => mapStaffRow(r.rowNumber, r.values, mapping))
        : parsed.rows
            .filter((r) => !skipRows.has(r.rowNumber))
            .map((r) => mapStudentRow(r.rowNumber, r.values, mapping));

    let committed = batch.committedRows ?? 0;
    let skipped = skipRows.size;

    const sessionId =
      batch.entity === 'students'
        ? await this.db.asTenant(job.tenantId, (tx) =>
            this.currentSessionId(tx, batch.tenantId, batch.branchId!),
          )
        : null;

    const classLookup =
      batch.entity === 'students' && sessionId
        ? await this.db.asTenant(job.tenantId, (tx) =>
            this.buildClassSectionLookup(tx, batch.branchId!, sessionId),
          )
        : null;

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const chunkCommitted = await this.db.asTenant(job.tenantId, async (tx) => {
        if (batch.entity === 'staff') {
          return this.insertStaffChunk(tx, batch, chunk, job.userId);
        }
        return this.insertStudentChunk(
          tx,
          batch,
          chunk,
          job.userId,
          sessionId!,
          classLookup!,
        );
      });

      committed += chunkCommitted;
      skipped += chunk.length - chunkCommitted;
      // Progress only — never rewrite a growing insertedIds blob.
      await this.db.asTenant(job.tenantId, async (tx) => {
        await tx
          .update(importBatches)
          .set({ committedRows: committed })
          .where(eq(importBatches.id, job.importId));
      });
    }

    await this.db.asTenant(job.tenantId, async (tx) => {
      await tx
        .update(importBatches)
        .set({
          status: 'committed',
          committedRows: committed,
          committedAt: new Date(),
        })
        .where(eq(importBatches.id, job.importId));
    });

    this.logger.log(`Import ${job.importId}: committed=${committed} skipped=${skipped}`);
    return { committed, skipped };
  }

  /**
   * Four statements per staff chunk: look up accounts by phone → create the
   * missing ones → membership → staff. Staff who arrive with a mobile number
   * get a login in `invited` state so step 7 of onboarding has someone to
   * invite; without this the wizard truthfully reports nobody is invitable.
   *
   * No role is assigned. A CSV designation is free text and the role decides
   * what the person can see, so granting one here would guess at permissions —
   * an admin grants roles from Staff.
   */
  private async insertStaffChunk(
    tx: Tx,
    batch: { id: string; tenantId: string; branchId: string | null },
    chunk: Array<{ fields: Record<string, string | null> }>,
    userId: string | null,
  ): Promise<number> {
    const rows = chunk
      .filter((r) => r.fields.employeeCode && r.fields.firstName)
      .map((r) => ({
        fields: r.fields,
        fullName: [r.fields.firstName, r.fields.middleName, r.fields.lastName]
          .filter(Boolean)
          .join(' '),
      }));

    if (rows.length === 0) return 0;

    // One login per phone: a repeated number in the file is the same human, or
    // bad data. Either way only the first row can own the account.
    const phones: string[] = [];
    for (const r of rows) {
      const phone = r.fields.phone;
      if (phone && !phones.includes(phone)) phones.push(phone);
    }

    const userIdByPhone = await this.ensureAccounts(
      tx,
      batch,
      phones,
      new Map(rows.filter((r) => r.fields.phone).map((r) => [r.fields.phone!, r.fullName])),
      'staff',
    );

    const claimed = new Set<string>();
    const values = rows.map((r) => {
      const phone = r.fields.phone;
      const account = phone && !claimed.has(phone) ? userIdByPhone.get(phone) : undefined;
      if (phone && account) claimed.add(phone);
      return {
        tenantId: batch.tenantId,
        branchId: batch.branchId!,
        userId: account ?? null,
        employeeCode: r.fields.employeeCode!,
        firstName: r.fields.firstName!,
        middleName: r.fields.middleName ?? null,
        lastName: r.fields.lastName ?? null,
        dateOfBirth: r.fields.dateOfBirth ?? null,
        gender: (r.fields.gender as never) ?? null,
        designation: r.fields.designation ?? null,
        department: r.fields.department ?? null,
        workEmail: r.fields.workEmail ?? null,
        personalPhone: phone ?? null,
        joinedOn: r.fields.joinedOn ?? null,
        importBatchId: batch.id,
        createdBy: userId,
      };
    });

    await tx.insert(staff).values(values);
    return values.length;
  }

  /**
   * Finds or creates one account per phone and makes sure each has a membership
   * in this tenant. Existing accounts are reused — the same person can already
   * be a parent at this school or staff at another one — and an existing
   * membership is left alone so an active member is never demoted to `invited`.
   *
   * Both staff and guardians come through here. An invitation is addressed to
   * an account, so a person imported without one cannot be invited at all: the
   * ledger has nobody to write a row against and the send is skipped silently.
   */
  private async ensureAccounts(
    tx: Tx,
    batch: { tenantId: string; branchId: string | null },
    phones: string[],
    nameByPhone: Map<string, string>,
    kind: 'staff' | 'guardian',
  ): Promise<Map<string, string>> {
    const byPhone = new Map<string, string>();
    if (phones.length === 0) return byPhone;

    const existing = await tx
      .select({ id: users.id, phone: users.phone })
      .from(users)
      .where(inArray(users.phone, phones));
    for (const u of existing) {
      if (u.phone) byPhone.set(u.phone, u.id);
    }

    const missing = phones.filter((p) => !byPhone.has(p));
    if (missing.length > 0) {
      // No email: `users.email` is globally unique, and an address that is
      // already registered elsewhere would fail the whole chunk. The invite
      // goes by SMS, so the phone is the only channel this account needs.
      const created = await tx
        .insert(users)
        .values(
          missing.map((phone) => ({
            phone,
            fullName: nameByPhone.get(phone) ?? fallbackName(kind),
            kind,
          })),
        )
        .onConflictDoNothing({ target: users.phone })
        .returning({ id: users.id, phone: users.phone });
      for (const u of created) {
        if (u.phone) byPhone.set(u.phone, u.id);
      }
    }

    const ids = [...byPhone.values()];
    if (ids.length > 0) {
      await tx
        .insert(userTenantMemberships)
        .values(
          ids.map((id) => ({
            tenantId: batch.tenantId,
            userId: id,
            branchId: batch.branchId,
            status: 'invited' as const,
          })),
        )
        .onConflictDoNothing();

      if (kind === 'guardian') await this.assignParentRole(tx, batch, ids);
    }

    return byPhone;
  }

  /**
   * Guardians get the `parent` role here; staff deliberately do not get a role.
   *
   * The difference is that a staff member's role is a decision only the school
   * can make — this person is a class teacher, that one runs the front office —
   * so we leave it to them. A guardian's role is not a decision at all: there
   * is exactly one thing a parent is. Without it they activate their invitation
   * into a session with no permissions, no navigation and no home screen, which
   * is a worse outcome than never having sent the invitation.
   */
  private async assignParentRole(
    tx: Tx,
    batch: { tenantId: string; branchId: string | null },
    userIds: string[],
  ): Promise<void> {
    const [parentRole] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.code, 'parent'), isNull(roles.tenantId)))
      .limit(1);

    if (!parentRole) {
      this.logger.error(
        'The `parent` system role is not seeded — imported guardians will have ' +
          'no permissions. Run the catalogue seed.',
      );
      return;
    }

    // `self` scope: the resolver derives which children from student_guardians,
    // so this grants a parent their own family and nothing else.
    await tx
      .insert(userRoleAssignments)
      .values(
        userIds.map((userId) => ({
          tenantId: batch.tenantId,
          userId,
          roleId: parentRole.id,
          branchId: batch.branchId,
          scopeType: 'self' as const,
          isPrimary: true,
        })),
      )
      .onConflictDoNothing();
  }

  /**
   * Four statements per 500-row chunk: students → enrollments → guardians →
   * student_guardians. Guardians are deduped by phone within the chunk.
   */
  private async insertStudentChunk(
    tx: Tx,
    batch: { id: string; tenantId: string; branchId: string | null },
    chunk: Array<{ fields: Record<string, string | null> }>,
    userId: string | null,
    sessionId: string,
    lookup: ClassSectionLookup,
  ): Promise<number> {
    type Prepared = {
      fields: Record<string, string | null>;
      studentId: string;
      classId: string;
      sectionId: string | null;
    };

    const prepared: Prepared[] = [];
    for (const row of chunk) {
      if (!row.fields.admissionNo || !row.fields.firstName) continue;
      const classLevel = row.fields.classLevel ? Number(row.fields.classLevel) : null;
      const classId =
        classLevel !== null
          ? (lookup.classByLevel.get(classLevel) ?? lookup.defaultClassId)
          : lookup.defaultClassId;
      if (!classId) continue;
      const sectionId =
        row.fields.sectionName && classId
          ? (lookup.sectionByClassAndName.get(
              `${classId}:${row.fields.sectionName.toUpperCase()}`,
            ) ?? null)
          : null;
      prepared.push({
        fields: row.fields,
        studentId: randomUUID(),
        classId,
        sectionId,
      });
    }

    if (prepared.length === 0) return 0;

    await tx.insert(students).values(
      prepared.map((p) => ({
        id: p.studentId,
        tenantId: batch.tenantId,
        branchId: batch.branchId!,
        admissionNo: p.fields.admissionNo!,
        firstName: p.fields.firstName!,
        middleName: p.fields.middleName ?? null,
        lastName: p.fields.lastName ?? null,
        dateOfBirth: p.fields.dateOfBirth ?? null,
        gender: (p.fields.gender as never) ?? null,
        importBatchId: batch.id,
        createdBy: userId,
      })),
    );

    await tx.insert(studentEnrollments).values(
      prepared.map((p) => ({
        tenantId: batch.tenantId,
        branchId: batch.branchId!,
        studentId: p.studentId,
        academicSessionId: sessionId,
        classId: p.classId,
        sectionId: p.sectionId,
        rollNo: p.fields.rollNo ?? null,
        importBatchId: batch.id,
        createdBy: userId,
      })),
    );

    // Deduplicate guardians by phone within the chunk — siblings share one parent.
    const guardianByPhone = new Map<string, { id: string; fullName: string }>();
    for (const p of prepared) {
      const phone = p.fields.phone;
      if (!phone) continue;
      if (guardianByPhone.has(phone)) continue;
      guardianByPhone.set(phone, {
        id: randomUUID(),
        fullName: p.fields.guardianName ?? `Parent of ${p.fields.firstName}`,
      });
    }

    if (guardianByPhone.size > 0) {
      // Same reason as staff: step 8 of onboarding invites accounts, and a
      // guardian row without one can be counted but never actually contacted.
      const guardianAccounts = await this.ensureAccounts(
        tx,
        batch,
        [...guardianByPhone.keys()],
        new Map([...guardianByPhone.entries()].map(([phone, g]) => [phone, g.fullName])),
        'guardian',
      );

      await tx.insert(guardians).values(
        [...guardianByPhone.entries()].map(([phone, g]) => ({
          id: g.id,
          tenantId: batch.tenantId,
          userId: guardianAccounts.get(phone) ?? null,
          fullName: g.fullName,
          phone,
          importBatchId: batch.id,
          createdBy: userId,
        })),
      );

      const links = prepared
        .filter((p) => p.fields.phone && guardianByPhone.has(p.fields.phone))
        .map((p) => ({
          tenantId: batch.tenantId,
          studentId: p.studentId,
          guardianId: guardianByPhone.get(p.fields.phone!)!.id,
          relation: 'father' as const,
          isPrimary: true,
          importBatchId: batch.id,
          createdBy: userId,
        }));

      if (links.length > 0) {
        await tx.insert(studentGuardians).values(links);
      }
    }

    return prepared.length;
  }

  private async currentSessionId(tx: Tx, tenantId: string, branchId: string): Promise<string> {
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
    if (!row) throw new Error('No current academic session configured for branch');
    return row.id;
  }

  private async buildClassSectionLookup(
    tx: Tx,
    branchId: string,
    sessionId: string,
  ): Promise<ClassSectionLookup> {
    const classRows = await tx
      .select({ id: classes.id, level: classes.level })
      .from(classes)
      .where(and(eq(classes.branchId, branchId), eq(classes.isActive, true)));

    const sectionRows = await tx
      .select({ id: sections.id, classId: sections.classId, name: sections.name })
      .from(sections)
      .where(
        and(
          eq(sections.branchId, branchId),
          eq(sections.academicSessionId, sessionId),
          eq(sections.isActive, true),
        ),
      );

    const classByLevel = new Map<number, string>();
    for (const c of classRows) classByLevel.set(c.level, c.id);

    const sectionByClassAndName = new Map<string, string>();
    for (const s of sectionRows) {
      sectionByClassAndName.set(`${s.classId}:${s.name.toUpperCase()}`, s.id);
    }

    return {
      classByLevel,
      sectionByClassAndName,
      defaultClassId: classRows[0]?.id ?? null,
    };
  }
}

interface ClassSectionLookup {
  classByLevel: Map<number, string>;
  sectionByClassAndName: Map<string, string>;
  defaultClassId: string | null;
}

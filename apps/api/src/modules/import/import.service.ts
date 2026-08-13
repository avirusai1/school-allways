import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';

import {
  guardians,
  importBatches,
  joinTokens,
  staff,
  studentEnrollments,
  studentGuardians,
  students,
  userRoleAssignments,
  userTenantMemberships,
  users,
} from '@saw/db';
import { StorageService } from '../../common/storage/storage.service';
import { ApiException } from '../../common/errors/api.exception';
import { RequestContextStore } from '../../common/context/request-context';
import { TenantDbService } from '../../common/database/tenant-db.service';
import { ImportQueueService } from './import-queue.service';
import { ImportRepository } from './import.repository';
import type {
  ColumnMapping,
  ImportEntity,
  ImportStatusResponse,
  ValidationResult,
} from './import.types';
import { detectVendor, suggestColumnMapping } from './import.util';
import { suggestMappingForVendor } from './mappers/generic.mapper';
import { parseImportFile } from './parsers/csv.parser';
import { buildErrorsWorkbook, buildImportTemplate } from './template/template.builder';
import {
  mapStaffRow,
  validateStaffRows,
  type StaffValidationContext,
} from './validators/staff.validator';
import {
  mapStudentRow,
  validateStudentRows,
  type StudentValidationContext,
} from './validators/student.validator';
import { ImportCommitService } from './processors/import-commit.processor';

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    private readonly db: TenantDbService,
    private readonly repo: ImportRepository,
    private readonly storage: StorageService,
    private readonly queue: ImportQueueService,
    private readonly commitService: ImportCommitService,
  ) {}

  async getTemplate(entity: ImportEntity): Promise<Buffer> {
    if (entity !== 'students' && entity !== 'staff') {
      throw new ApiException(400, 'INVALID_ENTITY', 'entity must be students or staff.');
    }
    return buildImportTemplate(entity);
  }

  async upload(params: {
    branchId: string;
    entity: ImportEntity;
    vendor?: string;
    filename: string;
    fileStream: NodeJS.ReadableStream;
  }) {
    const ctx = RequestContextStore.get();
    const importId = randomUUID();
    const objectKey = this.storage.importObjectKey(ctx.tenantId!, importId, params.filename);
    await this.storage.ensureDirForKey(objectKey);

    const absPath = this.storage.absolutePath(objectKey);
    await pipeline(params.fileStream, createWriteStream(absPath));

    const parsed = await parseImportFile(absPath);
    const vendorHint = params.vendor;
    const detectedVendor = detectVendor(parsed.headers);
    const vendor = vendorHint ?? detectedVendor;
    const suggestedMapping = suggestMappingForVendor(
      parsed.headers,
      vendor as 'generic' | 'entab' | 'teachmint' | 'myclassboard',
    );

    const [batch] = await this.db.run(async (tx) =>
      tx
        .insert(importBatches)
        .values({
          id: importId,
          tenantId: ctx.tenantId!,
          branchId: params.branchId,
          entity: params.entity,
          filePath: objectKey,
          detectedColumns: parsed.headers,
          columnMapping: Object.fromEntries(
            Object.entries(suggestedMapping).map(([k, v]) => [k, v.field]),
          ),
          vendor,
          startedByUserId: ctx.userId,
          createdBy: ctx.userId,
        })
        .returning({ id: importBatches.id }),
    );

    return {
      importId: batch.id,
      detectedColumns: parsed.headers,
      suggestedMapping,
      vendor,
    };
  }

  async map(importId: string, mapping: ColumnMapping, vendor?: string) {
    const batch = await this.getBatchOrThrow(importId);

    await this.db.run(async (tx) => {
      await tx
        .update(importBatches)
        .set({
          status: 'mapped',
          columnMapping: mapping,
          ...(vendor ? { vendor } : {}),
        })
        .where(eq(importBatches.id, importId));
    });

    const suggested = suggestColumnMapping(batch.detectedColumns ?? []);
    return {
      importId,
      mapping,
      suggestedMapping: suggested,
      requiresConfirmation: Object.values(suggested).some((m) => m.confidence < 0.95),
    };
  }

  async validate(importId: string): Promise<ValidationResult> {
    const batch = await this.getBatchOrThrow(importId);
    if (!batch.filePath) {
      throw new ApiException(400, 'NO_FILE', 'Import batch has no uploaded file.');
    }

    const result = await this.runValidation(batch);
    await this.db.run(async (tx) => {
      await tx
        .update(importBatches)
        .set({
          status: 'validated',
          totalRows: result.totalRows,
          validRows: result.validRows,
          errorRows: result.errorRows,
          validationResult: result as unknown as Record<string, unknown>,
        })
        .where(eq(importBatches.id, importId));
    });

    return result;
  }

  async commit(importId: string, partialCommit = true) {
    const batch = await this.getBatchOrThrow(importId);
    if (batch.status !== 'validated' && batch.status !== 'mapped') {
      throw new ApiException(
        409,
        'INVALID_STATE',
        'Import must be validated before commit.',
      );
    }

    const ctx = RequestContextStore.get();
    await this.db.run(async (tx) => {
      await tx
        .update(importBatches)
        .set({ status: 'committing', committedRows: 0 })
        .where(eq(importBatches.id, importId));
    });

    const { jobId, queued } = await this.queue.enqueueCommit({
      tenantId: ctx.tenantId!,
      userId: ctx.userId,
      importId,
      partialCommit,
    });

    if (!queued) {
      // Redis is down. Committing inline blocks this request, which is worse
      // than the alternative of losing the import entirely — but it must stay
      // visible, not become the normal path.
      this.logger.error(
        `Import ${importId} could not be queued; committing inline on the request thread.`,
      );
      await this.commitService.processCommit({
        tenantId: ctx.tenantId!,
        userId: ctx.userId,
        importId,
        partialCommit,
      });
    }

    return { jobId, importId };
  }

  async getStatus(importId: string): Promise<ImportStatusResponse> {
    const batch = await this.getBatchOrThrow(importId);
    const progressDenom = batch.validRows > 0 ? batch.validRows : batch.totalRows;
    const progressPct =
      progressDenom > 0 ? Math.round((batch.committedRows / progressDenom) * 100) : 0;

    return {
      status: batch.status,
      totalRows: batch.totalRows,
      validRows: batch.validRows,
      errorRows: batch.errorRows,
      committedRows: batch.committedRows,
      progressPct,
      jobId: this.queue.jobId(importId),
    };
  }

  async getErrorsXlsx(importId: string): Promise<Buffer> {
    const batch = await this.getBatchOrThrow(importId);
    const validation = batch.validationResult as ValidationResult | null;
    if (!validation?.errors?.length) {
      return buildErrorsWorkbook([], []);
    }

    if (!batch.filePath) {
      throw new ApiException(400, 'NO_FILE', 'Import batch has no uploaded file.');
    }

    const parsed = await parseImportFile(this.storage.absolutePath(batch.filePath));
    const errorRows = new Set(validation.errors.map((e) => e.row));
    const failedRows: Array<Record<string, string>> = [];
    const whatsWrong: string[] = [];

    for (const row of parsed.rows) {
      if (!errorRows.has(row.rowNumber)) continue;
      const rowErrors = validation.errors.filter((e) => e.row === row.rowNumber);
      failedRows.push(row.values);
      whatsWrong.push(rowErrors.map((e) => e.message).join('; '));
    }

    return buildErrorsWorkbook(failedRows, whatsWrong);
  }

  listBatches(branchId: string) {
    return this.db.run((tx) => this.repo.listRecent(tx, branchId));
  }

  async undo(importId: string) {
    const batch = await this.getBatchOrThrow(importId);
    if (batch.status === 'undone') {
      throw new ApiException(409, 'CONFLICT', 'This import has already been undone.');
    }

    await this.db.run(async (tx) => {
      // Constant-memory undo via import_batch_id — never walk a growing JSON blob.
      // Accounts first, while the staff and guardian rows that point at them
      // still exist — they are how the created logins are identified.
      await this.undoImportedAccounts(tx, importId);
      await tx
        .delete(studentGuardians)
        .where(eq(studentGuardians.importBatchId, importId));
      await tx.delete(guardians).where(eq(guardians.importBatchId, importId));
      await tx
        .delete(studentEnrollments)
        .where(eq(studentEnrollments.importBatchId, importId));
      await tx.delete(students).where(eq(students.importBatchId, importId));
      await tx.delete(staff).where(eq(staff.importBatchId, importId));

      // Legacy fallback: batches written before import_batch_id still carry insertedIds.
      const ids = batch.insertedIds ?? {};
      if (ids.enrollments?.length) {
        await tx
          .delete(studentEnrollments)
          .where(inArray(studentEnrollments.id, ids.enrollments));
      }
      if (ids.guardians?.length) {
        await tx
          .delete(studentGuardians)
          .where(inArray(studentGuardians.guardianId, ids.guardians));
        await tx.delete(guardians).where(inArray(guardians.id, ids.guardians));
      }
      if (ids.students?.length) {
        await tx.delete(students).where(inArray(students.id, ids.students));
      }
      if (ids.staff?.length) {
        await tx.delete(staff).where(inArray(staff.id, ids.staff));
      }

      await tx
        .update(importBatches)
        .set({ status: 'undone', undoneAt: new Date() })
        .where(eq(importBatches.id, importId));
    });

    RequestContextStore.addAudit({
      action: 'import.undone',
      entityType: 'import_batches',
      entityId: importId,
    });

    return { undone: true, importId };
  }

  /**
   * Undoing an import also has to undo the logins it created for staff and
   * guardians, or the school is left with phantom invited accounts it never
   * asked for. Only
   * untouched accounts are unwound: the invitation is still outstanding,
   * nothing has been consumed, and nobody has signed in. Once a person has
   * actually joined, their account is theirs and undo leaves it — along with
   * anything an admin granted them in the meantime.
   *
   * The membership, roles and tokens go; the global `users` row stays. The app
   * role has no DELETE on `users` by design (002_rls.sql), and it does not need
   * one: an identity with no membership belongs to no school and can reach
   * nothing. Re-importing the same number picks that identity back up.
   */
  private async undoImportedAccounts(
    tx: Parameters<Parameters<TenantDbService['run']>[0]>[0],
    importId: string,
  ): Promise<void> {
    const [staffRows, guardianRows] = await Promise.all([
      tx
        .select({ userId: staff.userId, tenantId: staff.tenantId })
        .from(staff)
        .where(and(eq(staff.importBatchId, importId), isNotNull(staff.userId))),
      tx
        .select({ userId: guardians.userId, tenantId: guardians.tenantId })
        .from(guardians)
        .where(and(eq(guardians.importBatchId, importId), isNotNull(guardians.userId))),
    ]);

    const rows = [...staffRows, ...guardianRows];
    if (rows.length === 0) return;

    const tenantId = rows[0]!.tenantId;
    const candidates = [...new Set(rows.map((r) => r.userId!))];

    const untouched = await tx
      .select({ userId: userTenantMemberships.userId })
      .from(userTenantMemberships)
      .innerJoin(users, eq(users.id, userTenantMemberships.userId))
      .where(
        and(
          eq(userTenantMemberships.tenantId, tenantId),
          inArray(userTenantMemberships.userId, candidates),
          eq(userTenantMemberships.status, 'invited'),
          isNull(users.lastLoginAt),
          sql`not exists (
            select 1 from join_tokens jt
            where jt.user_id = ${userTenantMemberships.userId}
              and jt.consumed_at is not null
          )`,
        ),
      );

    const removable = untouched.map((u) => u.userId);
    if (removable.length === 0) return;

    await tx
      .delete(joinTokens)
      .where(
        and(eq(joinTokens.tenantId, tenantId), inArray(joinTokens.userId, removable)),
      );
    await tx
      .delete(userRoleAssignments)
      .where(
        and(
          eq(userRoleAssignments.tenantId, tenantId),
          inArray(userRoleAssignments.userId, removable),
        ),
      );
    await tx
      .delete(userTenantMemberships)
      .where(
        and(
          eq(userTenantMemberships.tenantId, tenantId),
          inArray(userTenantMemberships.userId, removable),
        ),
      );
  }

  private async getBatchOrThrow(importId: string) {
    const batch = await this.db.run((tx) => this.repo.findById(tx, importId));
    if (!batch) throw new NotFoundException('Import batch not found');
    return batch;
  }

  private async runValidation(batch: Awaited<ReturnType<ImportRepository['findById']>> & object) {
    const filePath = this.storage.absolutePath(batch.filePath!);
    const parsed = await parseImportFile(filePath);
    const mapping = (batch.columnMapping ?? {}) as ColumnMapping;

    if (batch.entity === 'staff') {
      const mapped = parsed.rows.map((r) => mapStaffRow(r.rowNumber, r.values, mapping));
      const codes = mapped.map((r) => r.fields.employeeCode).filter(Boolean) as string[];
      const existing = await this.db.run((tx) =>
        this.repo.existingEmployeeCodes(tx, batch.branchId!, codes),
      );
      const { errors, warnings } = validateStaffRows(mapped, {
        existingEmployeeCodes: existing,
      } satisfies StaffValidationContext);
      return buildValidationResult(parsed.rows.length, errors, warnings);
    }

    const mapped = parsed.rows.map((r) => mapStudentRow(r.rowNumber, r.values, mapping));
    const admissionNos = mapped.map((r) => r.fields.admissionNo).filter(Boolean) as string[];
    const existing = await this.db.run((tx) =>
      this.repo.existingAdmissionNos(tx, batch.branchId!, admissionNos),
    );
    const { errors, warnings } = validateStudentRows(mapped, {
      existingAdmissionNos: existing,
    } satisfies StudentValidationContext);
    return buildValidationResult(parsed.rows.length, errors, warnings);
  }
}

function buildValidationResult(
  totalRows: number,
  errors: ValidationResult['errors'],
  warnings: ValidationResult['warnings'],
): ValidationResult {
  const errorRowNumbers = [...new Set(errors.map((e) => e.row))];
  return {
    totalRows,
    validRows: totalRows - errorRowNumbers.length,
    errorRows: errorRowNumbers.length,
    errors,
    warnings,
    errorRowNumbers,
  };
}

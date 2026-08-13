import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';

import { importBatches, staff, students } from '@saw/db';
import type { Tx } from '../../common/database/tenant-db.service';

@Injectable()
export class ImportRepository {
  async findById(tx: Tx, importId: string) {
    const [row] = await tx
      .select({
        id: importBatches.id,
        tenantId: importBatches.tenantId,
        branchId: importBatches.branchId,
        entity: importBatches.entity,
        status: importBatches.status,
        vendor: importBatches.vendor,
        filePath: importBatches.filePath,
        detectedColumns: importBatches.detectedColumns,
        columnMapping: importBatches.columnMapping,
        validationResult: importBatches.validationResult,
        totalRows: importBatches.totalRows,
        validRows: importBatches.validRows,
        errorRows: importBatches.errorRows,
        committedRows: importBatches.committedRows,
        insertedIds: importBatches.insertedIds,
        committedAt: importBatches.committedAt,
        createdAt: importBatches.createdAt,
      })
      .from(importBatches)
      .where(eq(importBatches.id, importId))
      .limit(1);
    return row ?? null;
  }

  listRecent(tx: Tx, branchId: string, limit = 20) {
    return tx
      .select({
        id: importBatches.id,
        entity: importBatches.entity,
        status: importBatches.status,
        totalRows: importBatches.totalRows,
        validRows: importBatches.validRows,
        errorRows: importBatches.errorRows,
        committedRows: importBatches.committedRows,
        createdAt: importBatches.createdAt,
        committedAt: importBatches.committedAt,
      })
      .from(importBatches)
      .where(eq(importBatches.branchId, branchId))
      .orderBy(desc(importBatches.createdAt))
      .limit(limit);
  }

  async existingAdmissionNos(tx: Tx, branchId: string, admissionNos: string[]) {
    if (admissionNos.length === 0) return new Map<string, { name: string }>();
    const rows = await tx
      .select({
        admissionNo: students.admissionNo,
        firstName: students.firstName,
        lastName: students.lastName,
      })
      .from(students)
      .where(and(eq(students.branchId, branchId), inArray(students.admissionNo, admissionNos)));

    const map = new Map<string, { name: string }>();
    for (const r of rows) {
      const name = [r.firstName, r.lastName].filter(Boolean).join(' ');
      map.set(r.admissionNo, { name });
    }
    return map;
  }

  async existingEmployeeCodes(tx: Tx, branchId: string, codes: string[]) {
    if (codes.length === 0) return new Map<string, { name: string }>();
    const rows = await tx
      .select({
        employeeCode: staff.employeeCode,
        firstName: staff.firstName,
        lastName: staff.lastName,
      })
      .from(staff)
      .where(and(eq(staff.branchId, branchId), inArray(staff.employeeCode, codes)));

    const map = new Map<string, { name: string }>();
    for (const r of rows) {
      const name = [r.firstName, r.lastName].filter(Boolean).join(' ');
      map.set(r.employeeCode, { name });
    }
    return map;
  }
}

import { Injectable } from '@nestjs/common';
import { and, eq, ilike, inArray, or } from 'drizzle-orm';

import { staff, staffSectionAssignments, staffSubjectAssignments } from '@saw/db';

import type { Tx } from '../../common/database/tenant-db.service';

@Injectable()
export class StaffRepository {
  list(tx: Tx, params: { branchId: string; q?: string; status?: string; isTeaching?: boolean }) {
    const conditions = [eq(staff.branchId, params.branchId), eq(staff.isActive, true)];
    if (params.status) conditions.push(eq(staff.status, params.status as never));
    if (params.isTeaching !== undefined) conditions.push(eq(staff.isTeaching, params.isTeaching));
    if (params.q) {
      conditions.push(
        or(
          ilike(staff.firstName, `%${params.q}%`),
          ilike(staff.lastName, `%${params.q}%`),
          ilike(staff.employeeCode, `%${params.q}%`),
        )!,
      );
    }

    return tx
      .select({
        id: staff.id,
        employeeCode: staff.employeeCode,
        firstName: staff.firstName,
        middleName: staff.middleName,
        lastName: staff.lastName,
        designation: staff.designation,
        photoPath: staff.photoPath,
        workPhone: staff.workPhone,
        workEmail: staff.workEmail,
        personalPhone: staff.personalPhone,
        isTeaching: staff.isTeaching,
        status: staff.status,
      })
      .from(staff)
      .where(and(...conditions))
      .limit(100);
  }

  findById(tx: Tx, staffId: string) {
    return tx
      .select({
        id: staff.id,
        userId: staff.userId,
        employeeCode: staff.employeeCode,
        firstName: staff.firstName,
        middleName: staff.middleName,
        lastName: staff.lastName,
        designation: staff.designation,
        photoPath: staff.photoPath,
        workPhone: staff.workPhone,
        workEmail: staff.workEmail,
        personalPhone: staff.personalPhone,
        isTeaching: staff.isTeaching,
        status: staff.status,
      })
      .from(staff)
      .where(eq(staff.id, staffId))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  /** True when the staff member is assigned to any of the given sections. */
  async hasSectionOverlap(tx: Tx, staffId: string, sectionIds: string[]): Promise<boolean> {
    if (sectionIds.length === 0) return false;
    const [row] = await tx
      .select({ id: staffSectionAssignments.id })
      .from(staffSectionAssignments)
      .where(
        and(
          eq(staffSectionAssignments.staffId, staffId),
          inArray(staffSectionAssignments.sectionId, sectionIds),
        ),
      )
      .limit(1);
    return !!row;
  }

  assignSection(
    tx: Tx,
    values: {
      tenantId: string;
      staffId: string;
      sectionId: string;
      academicSessionId: string;
      assignmentType: string;
      createdBy?: string | null;
    },
  ) {
    return tx.insert(staffSectionAssignments).values(values).returning({ id: staffSectionAssignments.id });
  }

  assignSubject(
    tx: Tx,
    values: {
      tenantId: string;
      staffId: string;
      sectionId: string;
      subjectId: string;
      academicSessionId: string;
      createdBy?: string | null;
    },
  ) {
    return tx.insert(staffSubjectAssignments).values(values).returning({ id: staffSubjectAssignments.id });
  }
}

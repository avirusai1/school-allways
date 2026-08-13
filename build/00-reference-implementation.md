# 00 — Reference Implementation

**Read this before every other build file.** It is one complete vertical slice
of the API. Every other module is a variation of these five files. Copy the
patterns exactly; do not invent alternatives.

The slice: **student list + detail + create**, because it exercises everything
hard — tenant scoping, permission scoping, keyset pagination, explicit response
DTOs, PII access logging, audit, and idempotency.

---

## 1. File tree for this slice

```
apps/api/src/modules/students/
├── students.module.ts
├── students.controller.ts
├── students.service.ts
├── students.repository.ts
├── dto/
│   ├── list-students.query.ts
│   ├── create-student.dto.ts
│   ├── update-student.dto.ts
│   └── student.response.ts
└── students.service.spec.ts
```

---

## 2. The query DTO — pagination + filters

```ts
// dto/list-students.query.ts
import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID,
  Max, MaxLength, Min,
} from 'class-validator';

/**
 * Base class every list query extends. Keyset pagination only — see
 * docs/06-performance-playbook.md §2.1 for why OFFSET is banned.
 */
export class PaginatedQuery {
  /** Opaque base64 cursor from the previous response's meta.nextCursor. */
  @IsOptional() @IsString() @MaxLength(500)
  cursor?: string;

  /** Server caps this at 100 regardless of what the client asks for. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit = 50;

  /** Sparse fieldsets: ?fields=id,firstName,rollNo */
  @IsOptional() @IsString() @MaxLength(500)
  fields?: string;
}

export class ListStudentsQuery extends PaginatedQuery {
  @IsOptional() @IsUUID() sectionId?: string;
  @IsOptional() @IsUUID() classId?: string;
  @IsOptional() @IsUUID() academicSessionId?: string;

  /** Free-text search on name or admission number. Trigram-indexed. */
  @IsOptional() @IsString() @MaxLength(100) q?: string;

  @IsOptional() @IsIn(['active', 'admitted', 'transferred_out', 'passed_out'])
  status?: string;

  @IsOptional() @Type(() => Boolean) @IsBoolean() isRteStudent?: boolean;

  @IsOptional() @IsIn(['name', 'rollNo', 'admissionNo', 'createdAt'])
  sort: 'name' | 'rollNo' | 'admissionNo' | 'createdAt' = 'name';

  @IsOptional() @IsIn(['asc', 'desc']) order: 'asc' | 'desc' = 'asc';
}
```

---

## 3. The response DTO — always explicit, never `return entity`

```ts
// dto/student.response.ts

/**
 * WHY THIS FILE EXISTS AT ALL
 * -----------------------------------------------------------------------
 * Returning a database row directly is how private columns escape. This
 * table has `aadhaarHash`, `aadhaarLast4` and `customFields`; none of them
 * belong in a list response, and a future column will be worse.
 *
 * Two audiences => TWO DTOs, never one filtered at the controller:
 *   StudentListItemDto  - what a teacher's roster needs (11 fields)
 *   StudentDetailDto    - the full profile, permission-gated
 *
 * The mapper functions below are the ONLY place a row becomes a response.
 */

export class StudentListItemDto {
  id!: string;
  admissionNo!: string;
  fullName!: string;
  rollNo!: string | null;
  className!: string | null;
  sectionName!: string | null;
  photoUrl!: string | null;
  gender!: string | null;
  isRteStudent!: boolean;
  attendancePercentageBp!: number | null;
  status!: string;
}

export class StudentDetailDto extends StudentListItemDto {
  firstName!: string;
  middleName!: string | null;
  lastName!: string | null;
  dateOfBirth!: string | null;
  bloodGroup!: string | null;
  socialCategory!: string | null;
  address!: {
    line1: string | null; line2: string | null;
    city: string | null; district: string | null;
    state: string | null; pincode: string | null;
  };
  apaar!: { id: string | null; status: string; generatedAt: string | null };
  guardians!: GuardianSummaryDto[];
  /** Present only if the caller holds `student.document.read`. */
  documents?: StudentDocumentDto[];
  /** Present only if the caller holds `health.record.read`. */
  health?: StudentHealthDto;
}

export class GuardianSummaryDto {
  id!: string;
  fullName!: string;
  relation!: string;
  isPrimary!: boolean;
  /** Masked for non-admin callers: "9198XXXX3210". */
  phone!: string | null;
  canPayFees!: boolean;
  canPickup!: boolean;
}

export class StudentDocumentDto {
  id!: string; docType!: string; title!: string | null;
  /** Short-lived signed URL. Never a raw storage path. */
  downloadUrl!: string;
  isVerified!: boolean; uploadedAt!: string;
}

export class StudentHealthDto {
  allergies!: string | null;
  chronicConditions!: string | null;
  medicationConsent!: boolean;
  bloodGroup!: string | null;
}

// --------------------------------------------------------------------------
// Mappers — the single place a row becomes a response.
// --------------------------------------------------------------------------

export function toListItem(row: StudentListRow): StudentListItemDto {
  return {
    id: row.id,
    admissionNo: row.admissionNo,
    fullName: [row.firstName, row.middleName, row.lastName]
      .filter(Boolean).join(' '),
    rollNo: row.rollNo,
    className: row.className,
    sectionName: row.sectionName,
    photoUrl: row.photoPath ? signPublicRead(row.photoPath) : null,
    gender: row.gender,
    isRteStudent: row.isRteStudent,
    attendancePercentageBp: row.attendancePercentageBp,
    status: row.status,
  };
}

/** 919876543210 -> 9198XXXX3210. Never log or return a full number. */
export function maskPhone(phone: string | null): string | null {
  if (!phone || phone.length < 8) return null;
  return `${phone.slice(0, 4)}XXXX${phone.slice(-4)}`;
}
```

---

## 4. The repository — every Drizzle query lives here

```ts
// students.repository.ts
import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, ilike, lt, or, sql, type SQL } from 'drizzle-orm';

import {
  attendanceSummaries, classes, sections,
  studentEnrollments, students,
} from '@saw/db';
import type { Tx } from '../../common/database/tenant-db.service';

@Injectable()
export class StudentsRepository {
  /**
   * NOTE THE SIGNATURE: every method takes `tx` as its first argument and
   * never opens its own transaction. The service owns the transaction; the
   * repository composes queries inside it. That is what makes tenant scoping
   * automatic — the tx already has `app.tenant_id` set — and what makes these
   * methods testable and composable.
   *
   * A repository method that calls `this.db.run()` itself is a bug.
   */

  async list(
    tx: Tx,
    params: {
      academicSessionId: string;
      scopePredicate?: SQL;        // from scopeFilter()
      sectionId?: string;
      classId?: string;
      q?: string;
      status?: string;
      cursor?: { value: string; id: string };
      limit: number;
      sort: string;
      order: 'asc' | 'desc';
    },
  ) {
    const conditions: SQL[] = [
      eq(studentEnrollments.academicSessionId, params.academicSessionId),
    ];

    // The scope predicate is non-negotiable. It arrives from scopeFilter()
    // and encodes "which sections may this caller see".
    if (params.scopePredicate) conditions.push(params.scopePredicate);

    if (params.sectionId) conditions.push(eq(studentEnrollments.sectionId, params.sectionId));
    if (params.classId) conditions.push(eq(studentEnrollments.classId, params.classId));
    if (params.status) conditions.push(eq(studentEnrollments.status, params.status as never));

    // Trigram index: students_name_trgm_idx. Without it this is a seq scan.
    if (params.q) {
      conditions.push(
        or(
          ilike(students.firstName, `%${params.q}%`),
          ilike(students.lastName, `%${params.q}%`),
          ilike(students.admissionNo, `%${params.q}%`),
        )!,
      );
    }

    // Keyset pagination. Compare the (sortValue, id) tuple so the cursor is
    // stable even when sort values collide — two students named "Aarav Sharma"
    // must not cause an infinite loop or a skipped row.
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

    // Columns are NAMED. `select()` with no argument ships 40 columns to
    // render 11 and is a rejected PR.
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
        sectionId: studentEnrollments.sectionId,
        sectionName: sections.name,
        className: classes.name,
        attendancePercentageBp: attendanceSummaries.percentageBp,
      })
      .from(studentEnrollments)
      .innerJoin(students, eq(students.id, studentEnrollments.studentId))
      .leftJoin(sections, eq(sections.id, studentEnrollments.sectionId))
      .leftJoin(classes, eq(classes.id, studentEnrollments.classId))
      // Pre-aggregated: never COUNT attendance rows here. See perf playbook §2.2.
      .leftJoin(
        attendanceSummaries,
        and(
          eq(attendanceSummaries.studentId, students.id),
          eq(attendanceSummaries.academicSessionId, params.academicSessionId),
          sql`${attendanceSummaries.termId} IS NULL`,
        ),
      )
      .where(and(...conditions))
      .orderBy(dir(sortCol), dir(students.id))
      .limit(params.limit + 1); // +1 to detect hasMore without a COUNT
  }

  async findById(tx: Tx, studentId: string, academicSessionId: string) {
    const [row] = await tx
      .select({
        /* ...named columns... */
        id: students.id,
        sectionId: studentEnrollments.sectionId,
      })
      .from(students)
      .leftJoin(
        studentEnrollments,
        and(
          eq(studentEnrollments.studentId, students.id),
          eq(studentEnrollments.academicSessionId, academicSessionId),
        ),
      )
      .where(eq(students.id, studentId))
      .limit(1);
    return row ?? null;
  }
}
```

---

## 5. The service — transactions, scoping, audit

```ts
// students.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';

import { RequestContextStore, type GrantedPermission }
  from '../../common/context/request-context';
import { TenantDbService } from '../../common/database/tenant-db.service';
import { scopeFilter, assertInScope } from '../../common/rbac/scope.util';
import { students, studentEnrollments } from '@saw/db';
import { StudentsRepository } from './students.repository';
import { decodeCursor, encodeCursor, type Page } from '../../common/pagination';
import { toListItem, type StudentListItemDto } from './dto/student.response';
import type { ListStudentsQuery } from './dto/list-students.query';

@Injectable()
export class StudentsService {
  constructor(
    private readonly db: TenantDbService,
    private readonly repo: StudentsRepository,
  ) {}

  async list(
    query: ListStudentsQuery,
    grant: GrantedPermission,
  ): Promise<Page<StudentListItemDto>> {
    const ctx = RequestContextStore.get();
    const sessionId = query.academicSessionId ?? (await this.currentSessionId());

    // THE SCOPE PREDICATE. A class teacher gets their sections; a parent gets
    // their children; a principal gets everything in the branch. An empty
    // scope list produces MATCH NOTHING, never match everything.
    const predicate = scopeFilter(
      grant,
      {
        sectionId: studentEnrollments.sectionId,
        studentId: studentEnrollments.studentId,
        branchId: students.branchId,
      },
      { branchId: ctx.branchId },
    );

    return this.db.run(async (tx) => {
      const rows = await this.repo.list(tx, {
        academicSessionId: sessionId,
        scopePredicate: predicate,
        sectionId: query.sectionId,
        classId: query.classId,
        q: query.q,
        status: query.status,
        cursor: decodeCursor(query.cursor),
        limit: Math.min(query.limit, 100),
        sort: query.sort,
        order: query.order,
      });

      const hasMore = rows.length > query.limit;
      const page = hasMore ? rows.slice(0, query.limit) : rows;
      const last = page.at(-1);

      return {
        data: page.map(toListItem),
        meta: {
          hasMore,
          count: page.length,
          nextCursor:
            hasMore && last
              ? encodeCursor(String(last[query.sort as never] ?? ''), last.id)
              : null,
        },
      };
    });
  }

  async findOne(studentId: string, grant: GrantedPermission) {
    const sessionId = await this.currentSessionId();

    return this.db.run(async (tx) => {
      const row = await this.repo.findById(tx, studentId, sessionId);
      if (!row) throw new NotFoundException('Student not found');

      // A filter is not enough on a single-record read: the caller supplied
      // the id, so we must prove that id is inside their scope.
      assertInScope(grant, {
        sectionId: row.sectionId,
        studentId: row.id,
      });

      // Student records are `confidential`. Every read is logged so a parent
      // can be told who looked at their child's file — a DPDP right, not a
      // nice-to-have. The interceptor flushes this after the response.
      RequestContextStore.addPiiRead({
        entityType: 'students',
        entityId: row.id,
        studentId: row.id,
        sensitivity: 'confidential',
        accessType: 'view',
      });

      return row;
    });
  }

  async create(dto: CreateStudentDto) {
    const ctx = RequestContextStore.get();

    return this.db.run(async (tx) => {
      const [created] = await tx
        .insert(students)
        .values({
          tenantId: ctx.tenantId!,
          branchId: dto.branchId,
          admissionNo: dto.admissionNo,
          firstName: dto.firstName,
          /* ... */
        })
        .returning({ id: students.id });

      // Same transaction: enrollment must not be able to fail independently
      // and leave a student with no class.
      await tx.insert(studentEnrollments).values({
        tenantId: ctx.tenantId!,
        branchId: dto.branchId,
        studentId: created.id,
        academicSessionId: dto.academicSessionId,
        classId: dto.classId,
        sectionId: dto.sectionId,
        rollNo: dto.rollNo,
      });

      RequestContextStore.addAudit({
        action: 'student.created',
        entityType: 'students',
        entityId: created.id,
      });

      return created;
    });
  }
}
```

---

## 6. The pagination helper (`common/pagination.ts`)

```ts
export interface Page<T> {
  data: T[];
  meta: { nextCursor: string | null; hasMore: boolean; count: number };
}

export function encodeCursor(value: string, id: string): string {
  return Buffer.from(JSON.stringify({ v: value, i: id })).toString('base64url');
}

export function decodeCursor(
  cursor?: string,
): { value: string; id: string } | undefined {
  if (!cursor) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    if (typeof parsed?.v !== 'string' || typeof parsed?.i !== 'string') return undefined;
    return { value: parsed.v, id: parsed.i };
  } catch {
    // A malformed cursor means "start from the beginning", not a 500. Clients
    // do send stale cursors after a version upgrade.
    return undefined;
  }
}
```

---

## 7. The controller — thin

```ts
// students.controller.ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';

import { Grant, RequirePermission } from '../../common/rbac/permission.decorator';
import type { GrantedPermission } from '../../common/context/request-context';
import { StudentsService } from './students.service';
import { ListStudentsQuery } from './dto/list-students.query';
import { CreateStudentDto } from './dto/create-student.dto';

@Controller('students')
export class StudentsController {
  constructor(private readonly service: StudentsService) {}

  /**
   * The two decorators work together and both are required:
   *   @RequirePermission - "may this caller do this at all?"  (the guard)
   *   @Grant             - "over which rows?"                 (the scope)
   * Using only the first is the single most common way to leak data.
   */
  @Get()
  @RequirePermission('student.record.read')
  list(
    @Query() query: ListStudentsQuery,
    @Grant('student.record.read') grant: GrantedPermission,
  ) {
    return this.service.list(query, grant);
  }

  @Get(':id')
  @RequirePermission('student.record.read')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Grant('student.record.read') grant: GrantedPermission,
  ) {
    return this.service.findOne(id, grant);
  }

  @Post()
  @RequirePermission('student.record.manage')
  create(@Body() dto: CreateStudentDto) {
    return this.service.create(dto);
  }
}
```

---

## 8. The test — prove the leak is closed

```ts
// students.service.spec.ts
describe('StudentsService.list', () => {
  it('returns only sections the class teacher is assigned to', async () => {
    const grant = {
      code: 'student.record.read',
      scope: 'section' as const,
      sectionIds: ['sec-5a'],
      studentIds: [],
      subjectIds: [],
    };

    const page = await service.list({ limit: 50 } as never, grant);

    expect(page.data.every((s) => s.sectionName === '5-A')).toBe(true);
  });

  it('returns NOTHING when a teacher has no sections assigned', async () => {
    const grant = { ...baseGrant, scope: 'section' as const, sectionIds: [] };
    const page = await service.list({ limit: 50 } as never, grant);

    // The inversion that matters: no sections must mean no students, never
    // all students.
    expect(page.data).toHaveLength(0);
  });

  it('returns only own children for a parent', async () => {
    const grant = { ...baseGrant, scope: 'self' as const, studentIds: ['child-1'] };
    const page = await service.list({ limit: 50 } as never, grant);
    expect(page.data.map((s) => s.id)).toEqual(['child-1']);
  });

  it('throws SCOPE_VIOLATION for another family\'s child', async () => {
    const grant = { ...baseGrant, scope: 'self' as const, studentIds: ['child-1'] };
    await expect(service.findOne('child-99', grant)).rejects.toThrow(ForbiddenException);
  });
});
```

**Every module ships these four tests, adapted.** They are the ones that matter.

---

## 9. Bulk write pattern — use everywhere

```ts
/**
 * 40 attendance rows = ONE insert. A loop of 40 awaits is 40 round trips and
 * a rejected PR. Chunk at 500 to stay inside Postgres parameter limits.
 */
const CHUNK = 500;
for (let i = 0; i < rows.length; i += CHUNK) {
  await tx.insert(studentAttendance).values(rows.slice(i, i + CHUNK));
}
```

## 10. Idempotent mutation pattern

```ts
@Post()
@RequirePermission('attendance.student.mark')
async mark(
  @Body() dto: MarkAttendanceDto,
  @Headers('x-client-mutation-id') mutationId?: string,
) {
  // The IdempotencyInterceptor (build/01 §6) handles lookup and storage.
  // The service only needs to write the id onto the row so the DB unique
  // index is the final backstop against a double-apply.
  return this.service.mark(dto, mutationId);
}
```

## 11. Queue-it pattern — anything slow

```ts
// ❌ Blocks the request for 40 seconds and holds a DB connection.
await this.pdf.generateReportCards(sectionId);

// ✅ Return immediately with a job handle the client can poll.
const job = await this.queue.add(
  'generate-report-cards',
  { sectionId, tenantId: ctx.tenantId },
  { jobId: `rc-${sectionId}-${examId}`, // deterministic => idempotent retry
    attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
);
return { jobId: job.id, status: 'queued' };
```

---

## 12. The eleven rules this file demonstrates

1. Controller validates and delegates. Never queries.
2. Service owns the transaction. Repository takes `tx`.
3. Every list applies `scopeFilter()`. Every read applies `assertInScope()`.
4. Named columns. Never `SELECT *`.
5. Keyset pagination with a `(sortValue, id)` tuple. Never `OFFSET`.
6. `limit + 1` to detect `hasMore`. Never `COUNT(*)`.
7. Explicit response DTOs and mappers. Never `return entity`.
8. Pre-aggregated summaries joined in. Never aggregate on a hot read.
9. PII reads logged; mutations audited.
10. Bulk writes chunked at 500. Never a loop of awaits.
11. Slow work queued with a deterministic job id.

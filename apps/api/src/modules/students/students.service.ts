import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';

import {
  auditLogs,
  classes,
  guardians,
  joinTokens,
  roles,
  sections,
  studentEnrollments,
  studentGuardians,
  students,
  userRoleAssignments,
  userTenantMemberships,
  users,
} from '@saw/db';
import { assertEmailAvailable } from '../../common/auth/account-email.util';
import {
  generateTemporaryPassword,
  hashPassword,
} from '../../common/auth/password.util';
import { BULK_ISSUE_MAX, type BulkIssueAccountsDto } from '../../common/dto/bulk-issue.dto';
import { TenantDbService, type Tx } from '../../common/database/tenant-db.service';
import { ApiException } from '../../common/errors/api.exception';
import { decodeCursor, encodeCursor, type Page } from '../../common/pagination';
import { scopeFilter, assertInScope } from '../../common/rbac/scope.util';
import { generateOpaqueToken, sha256 } from '../../common/utils/crypto.util';
import { normalizePhone } from '../import/import.util';
import { OnboardingService } from '../onboarding/onboarding.service';
import { parseImportFile } from '../import/parsers/csv.parser';
import { StudentsRepository } from './students.repository';
import type { CreateStudentDto } from './dto/create-student.dto';
import type { InviteStudentDto } from './dto/invite-student.dto';
import type { IssueGuardianAccountDto } from './dto/issue-guardian-account.dto';
import type { ListPendingGuardiansQuery } from './dto/list-pending-guardians.query';
import type { ListStudentsQuery } from './dto/list-students.query';
import {
  maskPhone,
  toListItem,
  type StudentDetailDto,
  type StudentListItemDto,
} from './dto/student.response';
import { RequestContextStore, type GrantedPermission } from '../../common/context/request-context';

@Injectable()
export class StudentsService {
  constructor(
    private readonly config: ConfigService,
    private readonly db: TenantDbService,
    private readonly repo: StudentsRepository,
    private readonly onboarding: OnboardingService,
  ) {}

  async list(
    query: ListStudentsQuery,
    grant: GrantedPermission,
  ): Promise<Page<StudentListItemDto>> {
    const ctx = RequestContextStore.get();
    const sessionId =
      query.academicSessionId ?? (await this.currentSessionId(ctx.branchId!));

    const predicate = scopeFilter(
      grant,
      {
        sectionId: studentEnrollments.sectionId,
        studentId: studentEnrollments.studentId,
        branchId: students.branchId,
      },
      { branchId: ctx.branchId },
    );

    const limit = Math.min(query.limit, 100);
    const filesBaseUrl = this.config.getOrThrow<string>('FILES_BASE_URL');

    return this.db.run(async (tx) => {
      const rows = await this.repo.list(tx, {
        academicSessionId: sessionId,
        scopePredicate: predicate,
        sectionId: query.sectionId,
        classId: query.classId,
        q: query.q,
        status: query.status,
        isRteStudent: query.isRteStudent,
        cursor: decodeCursor(query.cursor),
        limit,
        sort: query.sort,
        order: query.order,
      });

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const last = page.at(-1);

      const sortKey = query.sort as keyof (typeof page)[0];
      const cursorValue = last
        ? String((last as Record<string, unknown>)[sortKey] ?? last.sortValue ?? '')
        : '';

      return {
        data: page.map((row) =>
          toListItem(
            {
              id: row.id,
              admissionNo: row.admissionNo,
              firstName: row.firstName,
              middleName: row.middleName,
              lastName: row.lastName,
              photoPath: row.photoPath,
              gender: row.gender,
              isRteStudent: row.isRteStudent,
              rollNo: row.rollNo,
              status: row.status,
              sectionName: row.sectionName,
              className: row.className,
              attendancePercentageBp: row.attendancePercentageBp,
            },
            filesBaseUrl,
          ),
        ),
        meta: {
          hasMore,
          count: page.length,
          nextCursor: hasMore && last ? encodeCursor(cursorValue, last.id) : null,
        },
      };
    });
  }

  async findOne(studentId: string, grant: GrantedPermission): Promise<StudentDetailDto> {
    const ctx = RequestContextStore.get();
    const sessionId = await this.currentSessionId(ctx.branchId!);
    const filesBaseUrl = this.config.getOrThrow<string>('FILES_BASE_URL');

    return this.db.run(async (tx) => {
      const row = await this.repo.findById(tx, studentId, sessionId);
      if (!row) throw new NotFoundException('Student not found');

      assertInScope(grant, {
        sectionId: row.sectionId,
        studentId: row.id,
      });

      RequestContextStore.addPiiRead({
        entityType: 'students',
        entityId: row.id,
        studentId: row.id,
        sensitivity: 'confidential',
        accessType: 'view',
      });

      const guardianRows = await this.repo.listGuardians(tx, row.id);

      const base = toListItem(
        {
          id: row.id,
          admissionNo: row.admissionNo,
          firstName: row.firstName,
          middleName: row.middleName,
          lastName: row.lastName,
          photoPath: row.photoPath,
          gender: row.gender,
          isRteStudent: row.isRteStudent,
          rollNo: row.rollNo,
          status: row.status ?? 'active',
          sectionName: row.sectionName,
          className: row.className,
          attendancePercentageBp: row.attendancePercentageBp,
        },
        filesBaseUrl,
      );

      return {
        ...base,
        firstName: row.firstName,
        middleName: row.middleName,
        lastName: row.lastName,
        dateOfBirth: row.dateOfBirth,
        bloodGroup: row.bloodGroup,
        socialCategory: row.socialCategory,
        address: {
          line1: row.addressLine1,
          line2: row.addressLine2,
          city: row.city,
          district: row.district,
          state: row.state,
          pincode: row.pincode,
        },
        apaar: {
          id: row.apaarId,
          status: row.apaarStatus,
          generatedAt: row.apaarGeneratedAt?.toISOString() ?? null,
        },
        guardians: guardianRows.map((g) => ({
          id: g.id,
          fullName: g.fullName,
          relation: g.relation,
          isPrimary: g.isPrimary,
          phone: maskPhone(g.phone),
          canPayFees: g.canPayFees,
          canPickup: g.canPickup,
        })),
      };
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
          admissionDate: dto.admissionDate ?? null,
          firstName: dto.firstName,
          middleName: dto.middleName ?? null,
          lastName: dto.lastName ?? null,
          dateOfBirth: dto.dateOfBirth ?? null,
          gender: dto.gender as never,
          isRteStudent: dto.isRteStudent ?? false,
          aadhaarLast4: dto.aadhaarLast4 ?? null,
          aadhaarHash: dto.aadhaarHash ?? null,
          createdBy: ctx.userId,
        })
        .returning({ id: students.id });

      await tx.insert(studentEnrollments).values({
        tenantId: ctx.tenantId!,
        branchId: dto.branchId,
        studentId: created.id,
        academicSessionId: dto.academicSessionId,
        classId: dto.classId,
        sectionId: dto.sectionId ?? null,
        rollNo: dto.rollNo ?? null,
        createdBy: ctx.userId,
      });

      RequestContextStore.addAudit({
        action: 'student.created',
        entityType: 'students',
        entityId: created.id,
      });

      return { id: created.id };
    });
  }

  /**
   * Email invite for a student login. Email is entered at invite time (schools
   * often do not have a student address on the record). Creates the `users`
   * row if needed, assigns the `student` role (`self` scope), and fans the
   * join link out by email.
   */
  async inviteStudent(
    studentId: string,
    dto: InviteStudentDto,
    grant: GrantedPermission,
  ) {
    const ctx = RequestContextStore.get();
    const email = dto.email.trim().toLowerCase();
    const sessionId = await this.currentSessionId(ctx.branchId!);

    const pending = await this.db.run(async (tx) => {
      const row = await this.repo.findById(tx, studentId, sessionId);
      if (!row) throw new NotFoundException('Student not found');
      assertInScope(grant, {
        sectionId: row.sectionId,
        studentId: row.id,
      });

      await assertEmailAvailable(tx, email, row.userId);

      const fullName = [row.firstName, row.middleName, row.lastName]
        .filter(Boolean)
        .join(' ');
      const isMinor = isUnder18(row.dateOfBirth);

      let userId = row.userId as string | null;
      if (userId) {
        await tx
          .update(users)
          .set({ email, kind: 'student', isMinor, isActive: true })
          .where(eq(users.id, userId));
      } else {
        const [created] = await tx
          .insert(users)
          .values({
            email,
            fullName,
            displayName: row.firstName,
            kind: 'student',
            isMinor,
            isActive: true,
          })
          .returning({ id: users.id });
        userId = created.id;
        await tx.update(students).set({ userId }).where(eq(students.id, studentId));
      }

      await this.ensureStudentMembershipAndRole(tx, {
        tenantId: ctx.tenantId!,
        branchId: ctx.branchId ?? row.branchId,
        userId,
        academicSessionId: sessionId,
      });

      const token = generateOpaqueToken();
      const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      await tx.insert(joinTokens).values({
        tenantId: ctx.tenantId!,
        branchId: ctx.branchId ?? null,
        tokenHash: sha256(token),
        purpose: 'student_invite',
        studentId,
        userId,
        expiresAt,
      });

      await tx.insert(auditLogs).values({
        tenantId: ctx.tenantId!,
        branchId: ctx.branchId ?? null,
        actorUserId: ctx.userId,
        action: 'student.invite.sent',
        entityType: 'students',
        entityId: studentId,
        changes: {
          email: { from: null, to: email },
          userId: { from: row.userId, to: userId },
        },
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        requestId: ctx.requestId ?? null,
      });

      return { token, userId, firstName: row.firstName as string };
    });

    const queued = await this.onboarding.dispatchJoinInvites(
      [
        {
          userId: pending.userId,
          studentId,
          token: pending.token,
          variables: { name: pending.firstName },
        },
      ],
      {
        tenantId: ctx.tenantId!,
        templateCode: 'STUDENT_INVITE',
        channels: ['email'],
        label: 'Student',
        purpose: 'student_invite',
      },
    );

    return { invited: 1, queued, studentId, email };
  }

  private async ensureStudentMembershipAndRole(
    tx: Tx,
    opts: {
      tenantId: string;
      branchId: string | null;
      userId: string;
      academicSessionId: string;
    },
  ): Promise<void> {
    const [membership] = await tx
      .select({ id: userTenantMemberships.id, status: userTenantMemberships.status })
      .from(userTenantMemberships)
      .where(
        and(
          eq(userTenantMemberships.tenantId, opts.tenantId),
          eq(userTenantMemberships.userId, opts.userId),
        ),
      )
      .limit(1);

    if (!membership) {
      await tx.insert(userTenantMemberships).values({
        tenantId: opts.tenantId,
        userId: opts.userId,
        branchId: opts.branchId,
        status: 'invited',
        invitedAt: new Date(),
      });
    } else if (membership.status === 'left') {
      await tx
        .update(userTenantMemberships)
        .set({ status: 'invited', invitedAt: new Date(), leftAt: null })
        .where(eq(userTenantMemberships.id, membership.id));
    }

    const [studentRole] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.code, 'student'), isNull(roles.tenantId)))
      .limit(1);

    if (!studentRole) {
      throw new ApiException(
        503,
        'SERVICE_UNAVAILABLE',
        'The student role is not seeded. Contact support.',
      );
    }

    const [existing] = await tx
      .select({ id: userRoleAssignments.id })
      .from(userRoleAssignments)
      .where(
        and(
          eq(userRoleAssignments.tenantId, opts.tenantId),
          eq(userRoleAssignments.userId, opts.userId),
          eq(userRoleAssignments.roleId, studentRole.id),
        ),
      )
      .limit(1);

    if (!existing) {
      await tx.insert(userRoleAssignments).values({
        tenantId: opts.tenantId,
        userId: opts.userId,
        roleId: studentRole.id,
        branchId: opts.branchId,
        scopeType: 'self',
        scopeRefs: {},
        academicSessionId: opts.academicSessionId,
        isPrimary: true,
      });
    }
  }

  /**
   * Mint or activate a password login for a guardian. Same front-office path
   * as staff.account.issue — bypasses the join-link step.
   */
  async issueGuardianAccount(guardianId: string, dto: IssueGuardianAccountDto) {
    const ctx = RequestContextStore.get();
    const email = dto.email?.trim().toLowerCase() || null;
    const generated = !dto.password;
    const plainPassword = dto.password ?? generateTemporaryPassword();
    const passwordHash = await hashPassword(plainPassword);

    const result = await this.db.run(async (tx) => {
      const [guardian] = await tx
        .select({
          id: guardians.id,
          userId: guardians.userId,
          fullName: guardians.fullName,
          phone: guardians.phone,
          email: guardians.email,
        })
        .from(guardians)
        .where(eq(guardians.id, guardianId))
        .limit(1);
      if (!guardian) throw new NotFoundException('Guardian not found');

      if (!email && !guardian.phone) {
        throw new ApiException(
          400,
          'VALIDATION_FAILED',
          'This guardian has no phone on file. Add a phone or provide an email.',
        );
      }

      if (email) {
        await assertEmailAvailable(tx, email, guardian.userId);
      }

      let userId = guardian.userId;
      if (userId) {
        await tx
          .update(users)
          .set({
            ...(email ? { email, emailVerifiedAt: new Date() } : {}),
            passwordHash,
            isActive: true,
            failedLoginCount: 0,
            lockedUntil: null,
          })
          .where(eq(users.id, userId));
      } else {
        if (guardian.phone) {
          const [phoneTaken] = await tx
            .select({ id: users.id })
            .from(users)
            .where(eq(users.phone, guardian.phone))
            .limit(1);
          if (phoneTaken) {
            throw new ApiException(
              409,
              'ALREADY_EXISTS',
              'This guardian phone already has a login. Link that user instead of creating another.',
            );
          }
        }

        const [created] = await tx
          .insert(users)
          .values({
            phone: guardian.phone,
            email,
            emailVerifiedAt: email ? new Date() : null,
            passwordHash,
            fullName: guardian.fullName,
            kind: 'guardian',
            isMinor: false,
            isActive: true,
          })
          .returning({ id: users.id });
        userId = created.id;
        await tx
          .update(guardians)
          .set({ userId, ...(email ? { email } : {}) })
          .where(eq(guardians.id, guardianId));
      }

      await this.activateGuardianMembership(tx, userId);

      await tx.insert(auditLogs).values({
        tenantId: ctx.tenantId!,
        branchId: ctx.branchId ?? null,
        actorUserId: ctx.userId,
        action: 'guardian.account.issued',
        entityType: 'guardians',
        entityId: guardianId,
        changes: {
          email: { from: null, to: email },
          passwordGenerated: { from: false, to: generated },
          userId: { from: null, to: userId },
        },
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        requestId: ctx.requestId ?? null,
      });

      return { userId, email, phone: guardian.phone };
    });

    return {
      userId: result.userId,
      ...(result.email ? { email: result.email } : {}),
      ...(result.phone ? { phone: result.phone } : {}),
      ...(generated ? { temporaryPassword: plainPassword } : {}),
    };
  }

  /** Guardians who can receive front-desk credentials (phone on file, not active). */
  async listPendingGuardianAccounts(
    query: ListPendingGuardiansQuery,
    grant: GrantedPermission,
  ) {
    const ctx = RequestContextStore.get();
    const sessionId =
      query.academicSessionId ?? (await this.currentSessionId(ctx.branchId!));

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
      const rows = await tx
        .selectDistinctOn([guardians.id], {
          id: guardians.id,
          fullName: guardians.fullName,
          phone: guardians.phone,
          email: guardians.email,
          sectionName: sections.name,
          className: classes.name,
          membershipStatus: userTenantMemberships.status,
        })
        .from(guardians)
        .innerJoin(studentGuardians, eq(studentGuardians.guardianId, guardians.id))
        .innerJoin(students, eq(students.id, studentGuardians.studentId))
        .innerJoin(
          studentEnrollments,
          and(
            eq(studentEnrollments.studentId, students.id),
            eq(studentEnrollments.academicSessionId, sessionId),
            inArray(studentEnrollments.status, ['active', 'admitted']),
          ),
        )
        .innerJoin(sections, eq(sections.id, studentEnrollments.sectionId))
        .innerJoin(classes, eq(classes.id, studentEnrollments.classId))
        .leftJoin(users, eq(users.id, guardians.userId))
        .leftJoin(
          userTenantMemberships,
          and(
            eq(userTenantMemberships.userId, guardians.userId),
            eq(userTenantMemberships.tenantId, ctx.tenantId!),
          ),
        )
        .where(
          and(
            predicate,
            eq(studentGuardians.isPrimary, true),
            sql`${guardians.phone} is not null`,
            or(isNull(guardians.userId), sql`${userTenantMemberships.status} is distinct from 'active'`),
            ...(query.sectionId ? [eq(studentEnrollments.sectionId, query.sectionId)] : []),
            ...(query.classId ? [eq(studentEnrollments.classId, query.classId)] : []),
            ...(query.q
              ? [sql`${guardians.fullName} ilike ${'%' + query.q + '%'}`]
              : []),
          ),
        )
        .orderBy(guardians.id, guardians.fullName);

      const eligible = rows.filter((r) => r.membershipStatus !== 'active');

      return {
        data: eligible.map((r) => ({
          id: r.id,
          fullName: r.fullName,
          phone: maskPhone(r.phone ?? ''),
          hasEmail: Boolean(r.email?.trim()),
          sectionLabel: [r.className, r.sectionName].filter(Boolean).join(' · '),
        })),
        meta: { count: eligible.length },
      };
    });
  }

  async bulkIssueGuardianAccounts(dto: BulkIssueAccountsDto) {
    const ctx = RequestContextStore.get();
    const tenantId = ctx.tenantId!;

    if (!dto.ids?.length && !dto.all) {
      throw new ApiException(
        400,
        'VALIDATION_FAILED',
        'Pass ids or all=true to bulk-issue guardian accounts.',
      );
    }

    const { toIssue, skipped, skippedReasons } = await this.db.run((tx) =>
      this.resolveGuardianBulkTargets(tx, dto),
    );

    if (toIssue.length > BULK_ISSUE_MAX) {
      throw new ApiException(
        400,
        'VALIDATION_FAILED',
        `Too many eligible guardians (${toIssue.length}). Filter by class/section or issue in batches of ${BULK_ISSUE_MAX}.`,
      );
    }

    const issued: Array<{
      id: string;
      fullName: string;
      phone: string;
      temporaryPassword: string;
      sectionLabel?: string;
    }> = [];

    for (const row of toIssue) {
      const plainPassword = generateTemporaryPassword();
      const passwordHash = await hashPassword(plainPassword);
      const email = row.guardianEmail?.trim().toLowerCase() || null;
      const phone = row.phone;
      if (!phone) continue;

      await this.db.run(async (tx) => {
        if (email) {
          await assertEmailAvailable(tx, email, row.userId);
        }

        let userId = row.userId;
        if (userId) {
          await tx
            .update(users)
            .set({
              ...(email ? { email, emailVerifiedAt: new Date() } : {}),
              passwordHash,
              isActive: true,
              failedLoginCount: 0,
              lockedUntil: null,
            })
            .where(eq(users.id, userId));
        } else {
          const [created] = await tx
            .insert(users)
            .values({
              phone,
              email,
              emailVerifiedAt: email ? new Date() : null,
              passwordHash,
              fullName: row.fullName,
              kind: 'guardian',
              isMinor: false,
              isActive: true,
            })
            .returning({ id: users.id });
          userId = created.id;
          await tx
            .update(guardians)
            .set({ userId, ...(email ? { email } : {}) })
            .where(eq(guardians.id, row.id));
        }

        await this.activateGuardianMembership(tx, userId);
      });

      issued.push({
        id: row.id,
        fullName: row.fullName,
        phone,
        temporaryPassword: plainPassword,
        sectionLabel: row.sectionLabel,
      });
    }

    if (issued.length) {
      await this.db.run((tx) =>
        tx.insert(auditLogs).values({
          tenantId,
          branchId: ctx.branchId ?? null,
          actorUserId: ctx.userId,
          action: 'guardian.account.bulk_issued',
          entityType: 'guardians',
          entityId: null,
          changes: {
            count: { from: 0, to: issued.length },
            guardianIds: { from: [], to: issued.map((r) => r.id) },
            skippedCount: { from: 0, to: skipped.length },
            passwordGenerated: { from: false, to: true },
          },
          ip: ctx.ip ?? null,
          userAgent: ctx.userAgent ?? null,
          requestId: ctx.requestId ?? null,
        }),
      );
    }

    return { issued, skipped, skippedReasons };
  }

  /**
   * Bring in emails gathered offline. No invite side effect — callers send
   * invites explicitly once they are ready.
   */
  async bulkUpdateGuardianEmails(filePath: string) {
    const parsed = await parseImportFile(filePath);
    const phoneHeader =
      parsed.headers.find((h) => /phone|mobile/i.test(h)) ?? parsed.headers[0];
    const emailHeader =
      parsed.headers.find((h) => /email/i.test(h)) ??
      parsed.headers.find((h) => h !== phoneHeader);

    if (!phoneHeader || !emailHeader) {
      throw new ApiException(
        400,
        'VALIDATION_FAILED',
        'Upload needs phone and email columns.',
      );
    }

    const ctx = RequestContextStore.get();
    const tenantId = ctx.tenantId!;
    const unmatched: string[] = [];
    const updatedGuardianIds: string[] = [];
    const inviteReadyGuardianIds: string[] = [];
    let matched = 0;
    let updated = 0;

    await this.db.run(async (tx) => {
      const phoneRows = parsed.rows
        .map((row) => {
          const phone = normalizePhone(row.values[phoneHeader] ?? '');
          const email = (row.values[emailHeader] ?? '').trim().toLowerCase();
          return phone && email.includes('@') ? { phone, email, rowNumber: row.rowNumber } : null;
        })
        .filter((r): r is { phone: string; email: string; rowNumber: number } => r !== null);

      if (phoneRows.length === 0) {
        throw new ApiException(400, 'VALIDATION_FAILED', 'No valid phone/email rows found.');
      }

      const phones = [...new Set(phoneRows.map((r) => r.phone))];
      const guardiansByPhone = await tx
        .select({
          id: guardians.id,
          phone: guardians.phone,
          userId: guardians.userId,
          email: guardians.email,
          membershipStatus: userTenantMemberships.status,
        })
        .from(guardians)
        .leftJoin(
          userTenantMemberships,
          and(
            eq(userTenantMemberships.userId, guardians.userId),
            eq(userTenantMemberships.tenantId, tenantId),
          ),
        )
        .where(and(eq(guardians.tenantId, tenantId), inArray(guardians.phone, phones)));

      const byPhone = new Map(guardiansByPhone.map((g) => [g.phone!, g]));

      for (const row of phoneRows) {
        const guardian = byPhone.get(row.phone);
        if (!guardian) {
          unmatched.push(row.phone);
          continue;
        }
        matched += 1;

        if (guardian.email?.toLowerCase() === row.email) continue;

        await assertEmailAvailable(tx, row.email, guardian.userId);

        await tx
          .update(guardians)
          .set({ email: row.email })
          .where(eq(guardians.id, guardian.id));

        if (guardian.userId) {
          await tx
            .update(users)
            .set({ email: row.email, emailVerifiedAt: new Date() })
            .where(eq(users.id, guardian.userId));
        }

        updated += 1;
        updatedGuardianIds.push(guardian.id);
        if (guardian.membershipStatus === 'invited') {
          inviteReadyGuardianIds.push(guardian.id);
        }
      }
    });

    await this.db.run((tx) =>
      tx.insert(auditLogs).values({
        tenantId,
        branchId: ctx.branchId ?? null,
        actorUserId: ctx.userId,
        action: 'guardian.emails.bulk_updated',
        entityType: 'guardians',
        entityId: null,
        changes: {
          matched: { from: 0, to: matched },
          updated: { from: 0, to: updated },
          guardianIds: { from: [], to: updatedGuardianIds },
        },
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        requestId: ctx.requestId ?? null,
      }),
    );

    return {
      matched,
      updated,
      unmatched: [...new Set(unmatched)],
      inviteReadyGuardianIds,
    };
  }

  private async activateGuardianMembership(tx: Tx, userId: string) {
    const ctx = RequestContextStore.get();
    const [membership] = await tx
      .select({ id: userTenantMemberships.id, status: userTenantMemberships.status })
      .from(userTenantMemberships)
      .where(
        and(
          eq(userTenantMemberships.tenantId, ctx.tenantId!),
          eq(userTenantMemberships.userId, userId),
        ),
      )
      .limit(1);

    if (membership) {
      if (membership.status !== 'active') {
        await tx
          .update(userTenantMemberships)
          .set({ status: 'active', joinedAt: new Date() })
          .where(eq(userTenantMemberships.id, membership.id));
      }
    } else {
      await tx.insert(userTenantMemberships).values({
        tenantId: ctx.tenantId!,
        userId,
        branchId: ctx.branchId,
        status: 'active',
        joinedAt: new Date(),
      });
    }
  }

  private async resolveGuardianBulkTargets(tx: Tx, dto: BulkIssueAccountsDto) {
    const ctx = RequestContextStore.get();
    const tenantId = ctx.tenantId!;
    const sessionId = await this.currentSessionId(ctx.branchId!);
    const skipped: string[] = [];
    const skippedReasons: Record<string, string> = {};

    const candidates = await tx
      .selectDistinctOn([guardians.id], {
        id: guardians.id,
        userId: guardians.userId,
        fullName: guardians.fullName,
        phone: guardians.phone,
        guardianEmail: guardians.email,
        sectionName: sections.name,
        className: classes.name,
        membershipStatus: userTenantMemberships.status,
      })
      .from(guardians)
      .innerJoin(studentGuardians, eq(studentGuardians.guardianId, guardians.id))
      .innerJoin(students, eq(students.id, studentGuardians.studentId))
      .innerJoin(
        studentEnrollments,
        and(
          eq(studentEnrollments.studentId, students.id),
          eq(studentEnrollments.academicSessionId, sessionId),
          inArray(studentEnrollments.status, ['active', 'admitted']),
        ),
      )
      .innerJoin(sections, eq(sections.id, studentEnrollments.sectionId))
      .innerJoin(classes, eq(classes.id, studentEnrollments.classId))
      .leftJoin(
        userTenantMemberships,
        and(
          eq(userTenantMemberships.userId, guardians.userId),
          eq(userTenantMemberships.tenantId, tenantId),
        ),
      )
      .where(
        and(
          eq(guardians.tenantId, tenantId),
          eq(studentGuardians.isPrimary, true),
          ...(dto.ids?.length ? [inArray(guardians.id, dto.ids)] : []),
          ...(dto.sectionId ? [eq(studentEnrollments.sectionId, dto.sectionId)] : []),
          ...(dto.classId ? [eq(studentEnrollments.classId, dto.classId)] : []),
        ),
      )
      .orderBy(guardians.id);

    const byId = new Map(
      candidates.map((r) => [
        r.id,
        {
          ...r,
          sectionLabel: [r.className, r.sectionName].filter(Boolean).join(' · '),
        },
      ]),
    );

    if (dto.ids?.length) {
      const missingIds = dto.ids.filter((id) => !byId.has(id));
      if (missingIds.length) {
        const existing = await tx
          .select({ id: guardians.id })
          .from(guardians)
          .where(
            and(eq(guardians.tenantId, tenantId), inArray(guardians.id, missingIds)),
          );
        const exists = new Set(existing.map((r) => r.id));
        for (const id of missingIds) {
          skipped.push(id);
          skippedReasons[id] = exists.has(id) ? 'not_eligible' : 'not_found';
        }
      }
    }

    const toIssue: Array<(typeof candidates)[0] & { sectionLabel: string }> = [];
    for (const row of byId.values()) {
      if (!row.phone) {
        skipped.push(row.id);
        skippedReasons[row.id] = 'no_phone';
        continue;
      }
      if (row.membershipStatus === 'active') {
        skipped.push(row.id);
        skippedReasons[row.id] = 'already_active';
        continue;
      }
      toIssue.push(row);
    }

    return { toIssue, skipped, skippedReasons };
  }

  private async findEligibleGuardians(tx: Tx, dto: BulkIssueAccountsDto) {
    const { toIssue } = await this.resolveGuardianBulkTargets(tx, dto);
    return toIssue;
  }

  private async currentSessionId(branchId: string): Promise<string> {
    const ctx = RequestContextStore.get();
    const sessionId = await this.db.run((tx) =>
      this.repo.findCurrentSessionId(tx, ctx.tenantId!, branchId),
    );
    if (!sessionId) {
      throw new NotFoundException('No current academic session is configured for this branch.');
    }
    return sessionId;
  }
}

function isUnder18(dateOfBirth: string | Date | null | undefined): boolean {
  if (!dateOfBirth) return true;
  const birth = typeof dateOfBirth === 'string' ? new Date(`${dateOfBirth}T00:00:00Z`) : dateOfBirth;
  if (Number.isNaN(birth.getTime())) return true;
  const cutoff = new Date();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 18);
  return birth > cutoff;
}

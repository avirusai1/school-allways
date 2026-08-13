import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, inArray } from 'drizzle-orm';

import {
  auditLogs,
  staff,
  userTenantMemberships,
  users,
} from '@saw/db';
import {
  RequestContextStore,
  type GrantedPermission,
} from '../../common/context/request-context';
import { TenantDbService, type Tx } from '../../common/database/tenant-db.service';
import { ApiException } from '../../common/errors/api.exception';
import { assertEmailAvailable } from '../../common/auth/account-email.util';
import {
  generateTemporaryPassword,
  hashPassword,
} from '../../common/auth/password.util';
import type { BulkIssueAccountsDto } from '../../common/dto/bulk-issue.dto';
import { BULK_ISSUE_MAX } from '../../common/dto/bulk-issue.dto';
import { PermissionResolverService } from '../../common/rbac/permission-resolver.service';
import { maskPhone } from '../../common/utils/phone.util';
import { StaffRepository } from './staff.repository';
import type {
  AssignSectionDto,
  AssignSubjectDto,
  CreateStaffDto,
  IssueStaffAccountDto,
  ListPendingStaffQuery,
  ListStaffQuery,
} from './dto/staff.dto';
import { toStaffListItem } from './dto/staff.response';

@Injectable()
export class StaffService {
  constructor(
    private readonly config: ConfigService,
    private readonly db: TenantDbService,
    private readonly repo: StaffRepository,
    private readonly permissions: PermissionResolverService,
  ) {}

  async list(query: ListStaffQuery) {
    const ctx = RequestContextStore.get();
    const branchId = query.branchId ?? ctx.branchId!;
    const filesBaseUrl = this.config.getOrThrow<string>('FILES_BASE_URL');

    const rows = await this.db.run((tx) =>
      this.repo.list(tx, {
        branchId,
        q: query.q,
        status: query.status,
        isTeaching: query.isTeaching,
      }),
    );

    return {
      data: rows.map((row) => toStaffListItem(row, filesBaseUrl)),
      meta: { hasMore: false, count: rows.length, nextCursor: null },
    };
  }

  async findOne(staffId: string, grant: GrantedPermission) {
    const ctx = RequestContextStore.get();
    const filesBaseUrl = this.config.getOrThrow<string>('FILES_BASE_URL');
    const row = await this.db.run((tx) => this.repo.findById(tx, staffId));
    if (!row) throw new NotFoundException('Staff member not found');

    if (grant.scope === 'self') {
      if (!row.userId || row.userId !== ctx.userId) {
        throw new ForbiddenException(`Not your record (permission: ${grant.code})`);
      }
    } else if (grant.scope === 'section') {
      const sectionIds = grant.sectionIds ?? [];
      if (sectionIds.length === 0) {
        throw new ForbiddenException(`Outside your assigned sections (permission: ${grant.code})`);
      }
      const overlap = await this.db.run((tx) =>
        this.repo.hasSectionOverlap(tx, staffId, sectionIds),
      );
      if (!overlap) {
        throw new ForbiddenException(`Outside your assigned sections (permission: ${grant.code})`);
      }
    }
    // branch/tenant: ok. personalPhone is stripped by toStaffListItem.

    return toStaffListItem(row, filesBaseUrl);
  }

  async create(dto: CreateStaffDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [created] = await tx
        .insert(staff)
        .values({
          tenantId: ctx.tenantId!,
          branchId: dto.branchId,
          employeeCode: dto.employeeCode,
          firstName: dto.firstName,
          lastName: dto.lastName ?? null,
          designation: dto.designation ?? null,
          workPhone: dto.workPhone ?? null,
          workEmail: dto.workEmail ?? null,
          isTeaching: dto.isTeaching ?? true,
          createdBy: ctx.userId,
        })
        .returning({ id: staff.id });

      RequestContextStore.addAudit({
        action: 'staff.created',
        entityType: 'staff',
        entityId: created.id,
      });

      return created;
    });
  }

  async assignSection(staffId: string, dto: AssignSectionDto) {
    const ctx = RequestContextStore.get();
    const member = await this.db.run((tx) => this.repo.findById(tx, staffId));
    if (!member) throw new NotFoundException('Staff member not found');

    const [assignment] = await this.db.run((tx) =>
      this.repo.assignSection(tx, {
        tenantId: ctx.tenantId!,
        staffId,
        sectionId: dto.sectionId,
        academicSessionId: dto.academicSessionId,
        assignmentType: dto.assignmentType ?? 'class_teacher',
        createdBy: ctx.userId,
      }),
    );

    if (member.userId) {
      await this.permissions.invalidate(ctx.tenantId!, member.userId);
    }

    return assignment;
  }

  async assignSubject(staffId: string, dto: AssignSubjectDto) {
    const ctx = RequestContextStore.get();
    const member = await this.db.run((tx) => this.repo.findById(tx, staffId));
    if (!member) throw new NotFoundException('Staff member not found');

    const [assignment] = await this.db.run((tx) =>
      this.repo.assignSubject(tx, {
        tenantId: ctx.tenantId!,
        staffId,
        sectionId: dto.sectionId,
        subjectId: dto.subjectId,
        academicSessionId: dto.academicSessionId,
        createdBy: ctx.userId,
      }),
    );

    if (member.userId) {
      await this.permissions.invalidate(ctx.tenantId!, member.userId);
    }

    return assignment;
  }

  /**
   * Mint or activate a password login for a staff row. Bypasses invite/join —
   * the admin hands the credentials over in person (front-office use case).
   */
  async issueAccount(staffId: string, dto: IssueStaffAccountDto) {
    const ctx = RequestContextStore.get();
    const email = dto.email?.trim().toLowerCase() || null;
    const generated = !dto.password;
    const plainPassword = dto.password ?? generateTemporaryPassword();
    const passwordHash = await hashPassword(plainPassword);

    const result = await this.db.run(async (tx) => {
      const member = await this.repo.findById(tx, staffId);
      if (!member) throw new NotFoundException('Staff member not found');

      const phone = member.personalPhone ?? member.workPhone ?? null;
      if (!email && !phone) {
        throw new ApiException(
          400,
          'VALIDATION_FAILED',
          'This staff member has no phone on file. Add a phone or provide an email.',
        );
      }

      if (email) {
        await assertEmailAvailable(tx, email, member.userId);
      }

      const fullName = [member.firstName, member.lastName].filter(Boolean).join(' ');
      let userId = member.userId;

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
        if (phone) {
          const [phoneTaken] = await tx
            .select({ id: users.id })
            .from(users)
            .where(eq(users.phone, phone))
            .limit(1);
          if (phoneTaken) {
            throw new ApiException(
              409,
              'ALREADY_EXISTS',
              'This staff phone already has a login. Link that user instead of creating another.',
            );
          }
        }

        const [created] = await tx
          .insert(users)
          .values({
            phone,
            email,
            emailVerifiedAt: email ? new Date() : null,
            passwordHash,
            fullName: fullName || member.employeeCode,
            kind: 'staff',
            isMinor: false,
            isActive: true,
          })
          .returning({ id: users.id });
        userId = created.id;
        await tx.update(staff).set({ userId }).where(eq(staff.id, staffId));
      }

      await this.activateMembership(tx, userId);

      await tx.insert(auditLogs).values({
        tenantId: ctx.tenantId!,
        branchId: ctx.branchId ?? null,
        actorUserId: ctx.userId,
        action: 'staff.account.issued',
        entityType: 'staff',
        entityId: staffId,
        changes: {
          email: { from: null, to: email },
          passwordGenerated: { from: false, to: generated },
          userId: { from: null, to: userId },
        },
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        requestId: ctx.requestId ?? null,
      });

      return { userId, email, phone };
    });

    if (result.userId) {
      await this.permissions.invalidate(ctx.tenantId!, result.userId);
    }

    return {
      userId: result.userId,
      ...(result.email ? { email: result.email } : {}),
      ...(result.phone ? { phone: result.phone } : {}),
      ...(generated ? { temporaryPassword: plainPassword } : {}),
    };
  }

  /**
   * Front-desk scale path: auto-generated passwords only, skip anyone already
   * active. Passwords exist only in the response — never logged.
   */
  async listPendingStaffAccounts(query: ListPendingStaffQuery) {
    const ctx = RequestContextStore.get();
    const branchId = ctx.branchId!;

    return this.db.run(async (tx) => {
      const { toIssue } = await this.resolveStaffBulkTargets(
        tx,
        { all: true },
        branchId,
      );

      const filtered = toIssue.filter((row) => {
        const fullName = [row.firstName, row.lastName].filter(Boolean).join(' ');
        if (query.q && !fullName.toLowerCase().includes(query.q.toLowerCase())) {
          return false;
        }
        return true;
      });

      return {
        data: filtered.map((row) => ({
          id: row.id,
          fullName: [row.firstName, row.lastName].filter(Boolean).join(' ') || row.employeeCode,
          phone: maskPhone(row.personalPhone ?? row.workPhone ?? '') ?? '',
          hasEmail: Boolean(row.workEmail?.trim()),
          designation: row.designation ?? '',
        })),
        meta: { count: filtered.length },
      };
    });
  }

  async bulkIssueAccounts(dto: BulkIssueAccountsDto) {
    const ctx = RequestContextStore.get();
    const tenantId = ctx.tenantId!;
    const branchId = ctx.branchId!;

    if (!dto.ids?.length && !dto.all) {
      throw new ApiException(
        400,
        'VALIDATION_FAILED',
        'Pass ids or all=true to bulk-issue staff accounts.',
      );
    }

    const { toIssue, skipped, skippedReasons } = await this.db.run((tx) =>
      this.resolveStaffBulkTargets(tx, dto, branchId),
    );

    if (toIssue.length > BULK_ISSUE_MAX) {
      throw new ApiException(
        400,
        'VALIDATION_FAILED',
        `Too many eligible staff (${toIssue.length}). Use section filters or issue in batches of ${BULK_ISSUE_MAX}.`,
      );
    }

    const issued: Array<{
      id: string;
      fullName: string;
      phone: string;
      temporaryPassword: string;
    }> = [];

    for (const row of toIssue) {
      const plainPassword = generateTemporaryPassword();
      const passwordHash = await hashPassword(plainPassword);
      const email = row.workEmail?.trim().toLowerCase() || null;
      const phone = row.personalPhone ?? row.workPhone ?? null;
      if (!phone) continue;

      await this.db.run(async (tx) => {
        if (email) {
          await assertEmailAvailable(tx, email, row.userId);
        }

        let userId = row.userId;
        const fullName = [row.firstName, row.lastName].filter(Boolean).join(' ');

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
              fullName: fullName || row.employeeCode,
              kind: 'staff',
              isMinor: false,
              isActive: true,
            })
            .returning({ id: users.id });
          userId = created.id;
          await tx.update(staff).set({ userId }).where(eq(staff.id, row.id));
        }

        await this.activateMembership(tx, userId);
      });

      issued.push({
        id: row.id,
        fullName: [row.firstName, row.lastName].filter(Boolean).join(' ') || row.employeeCode,
        phone,
        temporaryPassword: plainPassword,
      });

      if (row.userId) {
        await this.permissions.invalidate(tenantId, row.userId);
      }
    }

    if (issued.length) {
      await this.db.run((tx) =>
        tx.insert(auditLogs).values({
          tenantId,
          branchId: ctx.branchId ?? null,
          actorUserId: ctx.userId,
          action: 'staff.account.bulk_issued',
          entityType: 'staff',
          entityId: null,
          changes: {
            count: { from: 0, to: issued.length },
            staffIds: { from: [], to: issued.map((r) => r.id) },
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

  private async resolveStaffBulkTargets(tx: Tx, dto: BulkIssueAccountsDto, branchId: string) {
    const ctx = RequestContextStore.get();
    const tenantId = ctx.tenantId!;
    const skipped: string[] = [];
    const skippedReasons: Record<string, string> = {};

    const rows = await tx
      .select({
        id: staff.id,
        userId: staff.userId,
        employeeCode: staff.employeeCode,
        firstName: staff.firstName,
        lastName: staff.lastName,
        personalPhone: staff.personalPhone,
        workPhone: staff.workPhone,
        workEmail: staff.workEmail,
        designation: staff.designation,
        membershipStatus: userTenantMemberships.status,
      })
      .from(staff)
      .leftJoin(
        userTenantMemberships,
        and(
          eq(userTenantMemberships.userId, staff.userId),
          eq(userTenantMemberships.tenantId, tenantId),
        ),
      )
      .where(
        and(
          eq(staff.tenantId, tenantId),
          eq(staff.branchId, branchId),
          eq(staff.isActive, true),
          ...(dto.ids?.length ? [inArray(staff.id, dto.ids)] : []),
        ),
      );

    const byId = new Map(rows.map((r) => [r.id, r]));

    if (dto.ids?.length) {
      for (const id of dto.ids) {
        if (!byId.has(id)) {
          skipped.push(id);
          skippedReasons[id] = 'not_found';
        }
      }
    }

    const toIssue: typeof rows = [];
    for (const row of byId.values()) {
      const phone = row.personalPhone ?? row.workPhone ?? null;
      if (!phone) {
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

  private async findEligibleStaff(tx: Tx, dto: BulkIssueAccountsDto, branchId: string) {
    const { toIssue } = await this.resolveStaffBulkTargets(tx, dto, branchId);
    return toIssue;
  }

  private async activateMembership(tx: Tx, userId: string) {
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
}

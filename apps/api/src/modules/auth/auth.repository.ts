import { Injectable } from '@nestjs/common';
import { and, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';

import {
  academicSessions,
  branches,
  otpCodes,
  sessions,
  tenants,
  userRoleAssignments,
  userTenantMemberships,
  users,
  roles,
} from '@saw/db';

import type { Tx } from '../../common/database/tenant-db.service';

export interface MembershipRow {
  membershipId: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantLogoPath: string | null;
  tenantStatus: string;
  branchId: string | null;
  branchName: string | null;
}

@Injectable()
export class AuthRepository {
  findUserByPhone(tx: Tx, phone: string) {
    return tx
      .select({
        id: users.id,
        phone: users.phone,
        email: users.email,
        fullName: users.fullName,
        displayName: users.displayName,
        avatarPath: users.avatarPath,
        preferredLanguage: users.preferredLanguage,
        kind: users.kind,
        isMinor: users.isMinor,
        passwordHash: users.passwordHash,
        failedLoginCount: users.failedLoginCount,
        lockedUntil: users.lockedUntil,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  findUserByEmail(tx: Tx, email: string) {
    return tx
      .select({
        id: users.id,
        phone: users.phone,
        email: users.email,
        fullName: users.fullName,
        displayName: users.displayName,
        avatarPath: users.avatarPath,
        preferredLanguage: users.preferredLanguage,
        kind: users.kind,
        isMinor: users.isMinor,
        passwordHash: users.passwordHash,
        failedLoginCount: users.failedLoginCount,
        lockedUntil: users.lockedUntil,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  findUserById(tx: Tx, userId: string) {
    return tx
      .select({
        id: users.id,
        fullName: users.fullName,
        displayName: users.displayName,
        avatarPath: users.avatarPath,
        preferredLanguage: users.preferredLanguage,
        kind: users.kind,
        isMinor: users.isMinor,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  /** True when the user still has at least one unactivated school invite. */
  async hasInvitedMembership(tx: Tx, userId: string): Promise<boolean> {
    const [row] = await tx
      .select({ id: userTenantMemberships.id })
      .from(userTenantMemberships)
      .where(
        and(
          eq(userTenantMemberships.userId, userId),
          eq(userTenantMemberships.status, 'invited'),
        ),
      )
      .limit(1);
    return !!row;
  }

  async listActiveMemberships(tx: Tx, userId: string): Promise<MembershipRow[]> {
    const rows = await tx
      .select({
        membershipId: userTenantMemberships.id,
        tenantId: userTenantMemberships.tenantId,
        tenantName: tenants.name,
        tenantSlug: tenants.slug,
        tenantLogoPath: tenants.logoPath,
        tenantStatus: tenants.status,
        branchId: userTenantMemberships.branchId,
        branchName: branches.name,
      })
      .from(userTenantMemberships)
      .innerJoin(tenants, eq(tenants.id, userTenantMemberships.tenantId))
      .leftJoin(branches, eq(branches.id, userTenantMemberships.branchId))
      .where(
        and(
          eq(userTenantMemberships.userId, userId),
          eq(userTenantMemberships.status, 'active'),
          eq(tenants.isActive, true),
        ),
      );

    const missingBranchTenantIds = [
      ...new Set(rows.filter((r) => !r.branchId).map((r) => r.tenantId)),
    ];

    const defaultBranches = new Map<string, { id: string; name: string }>();
    if (missingBranchTenantIds.length) {
      const branchRows = await tx
        .select({
          tenantId: branches.tenantId,
          id: branches.id,
          name: branches.name,
        })
        .from(branches)
        .where(
          and(
            inArray(branches.tenantId, missingBranchTenantIds),
            eq(branches.isActive, true),
          ),
        )
        .orderBy(branches.code);

      for (const row of branchRows) {
        if (!defaultBranches.has(row.tenantId)) {
          defaultBranches.set(row.tenantId, { id: row.id, name: row.name });
        }
      }
    }

    return rows.map((row) => {
      const fallback = row.branchId ? null : defaultBranches.get(row.tenantId);
      return {
        membershipId: row.membershipId,
        tenantId: row.tenantId,
        tenantName: row.tenantName,
        tenantSlug: row.tenantSlug,
        tenantLogoPath: row.tenantLogoPath,
        tenantStatus: row.tenantStatus,
        branchId: row.branchId ?? fallback?.id ?? null,
        branchName: row.branchName ?? fallback?.name ?? null,
      };
    });
  }

  findMembership(tx: Tx, userId: string, tenantId: string) {
    return tx
      .select({
        id: userTenantMemberships.id,
        tenantId: userTenantMemberships.tenantId,
        branchId: userTenantMemberships.branchId,
        status: userTenantMemberships.status,
        tenantStatus: tenants.status,
      })
      .from(userTenantMemberships)
      .innerJoin(tenants, eq(tenants.id, userTenantMemberships.tenantId))
      .where(
        and(
          eq(userTenantMemberships.userId, userId),
          eq(userTenantMemberships.tenantId, tenantId),
          eq(userTenantMemberships.status, 'active'),
        ),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  invalidateOtps(
    tx: Tx,
    params: { phone?: string | null; email?: string | null; purpose: string },
  ) {
    const identity =
      params.phone && params.email
        ? or(eq(otpCodes.phone, params.phone), eq(otpCodes.email, params.email))
        : params.phone
          ? eq(otpCodes.phone, params.phone)
          : params.email
            ? eq(otpCodes.email, params.email)
            : sql`false`;

    return tx
      .update(otpCodes)
      .set({ consumedAt: sql`now()` })
      .where(
        and(
          identity,
          eq(otpCodes.purpose, params.purpose as never),
          isNull(otpCodes.consumedAt),
        ),
      );
  }

  insertOtp(
    tx: Tx,
    params: {
      userId: string | null;
      phone?: string | null;
      email?: string | null;
      purpose: string;
      codeHash: string;
      expiresAt: Date;
      requestIp?: string;
    },
  ) {
    return tx.insert(otpCodes).values({
      userId: params.userId,
      phone: params.phone ?? null,
      email: params.email ?? null,
      purpose: params.purpose as never,
      codeHash: params.codeHash,
      expiresAt: params.expiresAt,
      requestIp: params.requestIp ?? null,
    });
  }

  findLatestOtp(
    tx: Tx,
    params: { phone?: string | null; email?: string | null; purpose: string },
  ) {
    const identity =
      params.phone && params.email
        ? or(eq(otpCodes.phone, params.phone), eq(otpCodes.email, params.email))
        : params.phone
          ? eq(otpCodes.phone, params.phone)
          : params.email
            ? eq(otpCodes.email, params.email)
            : sql`false`;

    return tx
      .select({
        id: otpCodes.id,
        codeHash: otpCodes.codeHash,
        expiresAt: otpCodes.expiresAt,
        consumedAt: otpCodes.consumedAt,
        attemptCount: otpCodes.attemptCount,
      })
      .from(otpCodes)
      .where(and(identity, eq(otpCodes.purpose, params.purpose as never)))
      .orderBy(desc(otpCodes.createdAt))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  incrementOtpAttempts(tx: Tx, otpId: string, attemptCount: number) {
    return tx
      .update(otpCodes)
      .set({ attemptCount })
      .where(eq(otpCodes.id, otpId));
  }

  consumeOtp(tx: Tx, otpId: string) {
    return tx
      .update(otpCodes)
      .set({ consumedAt: sql`now()` })
      .where(eq(otpCodes.id, otpId));
  }

  insertSession(
    tx: Tx,
    params: {
      userId: string;
      refreshTokenHash: string;
      expiresAt: Date;
      activeTenantId: string | null;
      activeBranchId: string | null;
      deviceId?: string;
      deviceName?: string;
      platform?: string;
      appVersion?: string;
      ip?: string;
      userAgent?: string;
    },
  ) {
    return tx
      .insert(sessions)
      .values({
        userId: params.userId,
        refreshTokenHash: params.refreshTokenHash,
        expiresAt: params.expiresAt,
        activeTenantId: params.activeTenantId,
        activeBranchId: params.activeBranchId,
        deviceId: params.deviceId ?? null,
        deviceName: params.deviceName ?? null,
        platform: params.platform ?? null,
        appVersion: params.appVersion ?? null,
        ip: params.ip ?? null,
        userAgent: params.userAgent ?? null,
        lastUsedAt: sql`now()`,
      })
      .returning({ id: sessions.id });
  }

  findSessionByRefreshHash(tx: Tx, refreshTokenHash: string) {
    return tx
      .select({
        id: sessions.id,
        userId: sessions.userId,
        refreshTokenHash: sessions.refreshTokenHash,
        expiresAt: sessions.expiresAt,
        revokedAt: sessions.revokedAt,
        activeTenantId: sessions.activeTenantId,
        activeBranchId: sessions.activeBranchId,
      })
      .from(sessions)
      .where(eq(sessions.refreshTokenHash, refreshTokenHash))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  revokeSession(tx: Tx, sessionId: string, reason: string) {
    return tx
      .update(sessions)
      .set({ revokedAt: sql`now()`, revokedReason: reason })
      .where(eq(sessions.id, sessionId));
  }

  revokeAllUserSessions(tx: Tx, userId: string, reason: string) {
    return tx
      .update(sessions)
      .set({ revokedAt: sql`now()`, revokedReason: reason })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }

  rotateSessionToken(
    tx: Tx,
    sessionId: string,
    refreshTokenHash: string,
    expiresAt: Date,
  ) {
    return tx
      .update(sessions)
      .set({
        refreshTokenHash,
        expiresAt,
        lastUsedAt: sql`now()`,
      })
      .where(eq(sessions.id, sessionId));
  }

  updateSessionTenant(
    tx: Tx,
    sessionId: string,
    tenantId: string,
    branchId: string | null,
  ) {
    return tx
      .update(sessions)
      .set({ activeTenantId: tenantId, activeBranchId: branchId })
      .where(eq(sessions.id, sessionId));
  }

  updateUserLogin(tx: Tx, userId: string) {
    return tx
      .update(users)
      .set({
        lastLoginAt: sql`now()`,
        failedLoginCount: 0,
        lockedUntil: null,
      })
      .where(eq(users.id, userId));
  }

  incrementFailedLogins(tx: Tx, userId: string, failedLoginCount: number, lockedUntil: Date | null) {
    return tx
      .update(users)
      .set({ failedLoginCount, lockedUntil })
      .where(eq(users.id, userId));
  }

  async listUserRoles(
    tx: Tx,
    tenantId: string,
    userId: string,
    branchId: string | null,
  ) {
    const now = new Date();
    return tx
      .select({
        code: roles.code,
        name: roles.name,
        isPrimary: userRoleAssignments.isPrimary,
      })
      .from(userRoleAssignments)
      .innerJoin(roles, eq(roles.id, userRoleAssignments.roleId))
      .where(
        and(
          eq(userRoleAssignments.tenantId, tenantId),
          eq(userRoleAssignments.userId, userId),
          or(isNull(userRoleAssignments.validTo), gt(userRoleAssignments.validTo, now)),
          branchId
            ? or(
                isNull(userRoleAssignments.branchId),
                eq(userRoleAssignments.branchId, branchId),
              )
            : sql`true`,
        ),
      );
  }

  findBranch(tx: Tx, branchId: string) {
    return tx
      .select({
        id: branches.id,
        tenantId: branches.tenantId,
        code: branches.code,
        name: branches.name,
        board: branches.board,
      })
      .from(branches)
      .where(eq(branches.id, branchId))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  findCurrentAcademicSession(tx: Tx, tenantId: string, branchId: string) {
    return tx
      .select({
        id: academicSessions.id,
        name: academicSessions.name,
      })
      .from(academicSessions)
      .where(
        and(
          eq(academicSessions.tenantId, tenantId),
          eq(academicSessions.branchId, branchId),
          eq(academicSessions.isCurrent, true),
        ),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }
}

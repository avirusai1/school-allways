/**
 * Resolves a user's effective permissions inside one tenant.
 *
 * THE HARD PART IS NOT "does the user have the permission".
 * It is "over WHICH ROWS". A Subject Teacher holding `student.record.read`
 * at `section` scope may read students in the sections they teach, and no
 * others. That resolution happens here, once per request, and the result is
 * what the query builder turns into a SQL predicate.
 *
 * Three things this must get right:
 *
 *  1. UNION ACROSS ROLES. A teacher who is also Exam Coordinator gets the
 *     union of both bundles. Where the same permission appears twice, the
 *     WIDER scope wins.
 *
 *  2. TIME AND BRANCH BOUNDS. "Class teacher of 5B" expires on 31 March.
 *     Expired assignments are excluded, not deleted — audit logs reference them.
 *
 *  3. PLAN GATING. A school on the Free plan simply does not receive
 *     permissions whose module is outside their plan, so no individual
 *     endpoint has to remember to check it.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import type Redis from 'ioredis';

import {
  guardians as guardiansTable,
  permissions as permissionsTable,
  plans,
  rolePermissions,
  roles,
  staffSectionAssignments,
  staffSubjectAssignments,
  staff as staffTable,
  studentGuardians,
  students as studentsTable,
  subscriptions,
  userRoleAssignments,
} from '@saw/db';

import type { GrantedPermission, ScopeType } from '../context/request-context';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { TenantDbService, type Tx } from '../database/tenant-db.service';

/** Widest wins when the same permission arrives from two roles. */
const SCOPE_BREADTH: Record<ScopeType, number> = {
  self: 0,
  subject: 1,
  section: 2,
  branch: 3,
  tenant: 4,
};

export interface ResolvedAccess {
  roleCodes: string[];
  permissions: Map<string, GrantedPermission>;
  navManifest: string[];
  homeScreen: string | null;
}

@Injectable()
export class PermissionResolverService {
  private readonly logger = new Logger(PermissionResolverService.name);
  /** Resolution is a multi-join; cache briefly. Invalidated on every change. */
  private readonly CACHE_TTL_SECONDS = 300;

  constructor(
    private readonly db: TenantDbService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  private cacheKey(tenantId: string, userId: string, branchId: string | null): string {
    return `perm:v1:${tenantId}:${userId}:${branchId ?? 'all'}`;
  }

  /**
   * Must be called whenever a role assignment, custom role, or plan changes.
   * Forgetting is how a revoked teacher keeps access for five minutes, so the
   * RBAC and billing services call this directly rather than relying on TTL.
   */
  async invalidate(tenantId: string, userId?: string): Promise<void> {
    const pattern = userId ? `perm:v1:${tenantId}:${userId}:*` : `perm:v1:${tenantId}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length) await this.redis.del(...keys);
  }

  async resolve(
    tenantId: string,
    userId: string,
    branchId: string | null,
  ): Promise<ResolvedAccess> {
    const key = this.cacheKey(tenantId, userId, branchId);
    const cached = await this.redis.get(key);
    if (cached) return this.deserialise(cached);

    const resolved = await this.db.asTenant(tenantId, (tx) =>
      this.computeAccess(tx, tenantId, userId, branchId),
    );
    await this.redis.setex(key, this.CACHE_TTL_SECONDS, this.serialise(resolved));
    return resolved;
  }

  // -------------------------------------------------------------------------

  private async computeAccess(
    tx: Tx,
    tenantId: string,
    userId: string,
    branchId: string | null,
  ): Promise<ResolvedAccess> {
    const now = new Date();

    // --- 1. Active role assignments -----------------------------------------
    const assignments = await tx
      .select({
        roleId: userRoleAssignments.roleId,
        roleCode: roles.code,
        homeScreen: roles.homeScreen,
        navManifest: roles.navManifest,
        isPrimary: userRoleAssignments.isPrimary,
        scopeType: userRoleAssignments.scopeType,
        scopeRefs: userRoleAssignments.scopeRefs,
      })
      .from(userRoleAssignments)
      .innerJoin(roles, eq(roles.id, userRoleAssignments.roleId))
      .where(
        and(
          eq(userRoleAssignments.tenantId, tenantId),
          eq(userRoleAssignments.userId, userId),
          // Open-ended when valid_to is NULL.
          or(isNull(userRoleAssignments.validTo), gt(userRoleAssignments.validTo, now)),
          // A NULL branch on the assignment means "all branches in the tenant".
          branchId
            ? or(isNull(userRoleAssignments.branchId), eq(userRoleAssignments.branchId, branchId))
            : sql`true`,
        ),
      );

    if (assignments.length === 0) {
      this.logger.debug(`No active roles for user=${userId} tenant=${tenantId}`);
      return { roleCodes: [], permissions: new Map(), navManifest: [], homeScreen: null };
    }

    // --- 2. Modules allowed by the current plan -----------------------------
    const allowedModules = await this.allowedModules(tx, tenantId);

    // --- 3. Permission rows for those roles ---------------------------------
    const roleIds = [...new Set(assignments.map((a) => a.roleId))];
    const permRows = await tx
      .select({
        roleId: rolePermissions.roleId,
        code: permissionsTable.code,
        moduleCode: permissionsTable.moduleCode,
        defaultScope: rolePermissions.defaultScope,
      })
      .from(rolePermissions)
      .innerJoin(permissionsTable, eq(permissionsTable.id, rolePermissions.permissionId))
      .where(inArray(rolePermissions.roleId, roleIds));

    // --- 4. Concrete scope targets ------------------------------------------
    const [ownSectionIds, taught, ownStudentIds] = await Promise.all([
      this.classTeacherSectionIds(tx, tenantId, userId),
      this.taughtSectionsAndSubjects(tx, tenantId, userId),
      this.ownStudentIds(tx, tenantId, userId),
    ]);

    const sectionIds = [...new Set([...ownSectionIds, ...taught.sectionIds])];

    // --- 5. Union across roles, widest scope wins ---------------------------
    const byRole = new Map(assignments.map((a) => [a.roleId, a]));
    const granted = new Map<string, GrantedPermission>();

    for (const row of permRows) {
      // Plan gate — a Free-plan school never receives Pro permissions.
      if (allowedModules && !allowedModules.has(row.moduleCode)) continue;

      const assignment = byRole.get(row.roleId);
      if (!assignment) continue;

      /**
       * An explicit scope on the ASSIGNMENT narrows the role's default — that
       * is how a school restricts a shared role without cloning it. We take
       * the narrower of the two so an assignment can never widen a role.
       */
      const roleScope = row.defaultScope as ScopeType;
      const assignedScope = (assignment.scopeType ?? roleScope) as ScopeType;
      const scope =
        SCOPE_BREADTH[assignedScope] < SCOPE_BREADTH[roleScope] ? assignedScope : roleScope;

      const existing = granted.get(row.code);
      if (existing && SCOPE_BREADTH[existing.scope] >= SCOPE_BREADTH[scope]) continue;

      const refs = (assignment.scopeRefs ?? {}) as Record<string, string[]>;
      granted.set(row.code, {
        code: row.code,
        scope,
        sectionIds: refs.sectionIds?.length ? refs.sectionIds : sectionIds,
        subjectIds: refs.subjectIds?.length ? refs.subjectIds : taught.subjectIds,
        studentIds: ownStudentIds,
      });
    }

    const primary = assignments.find((a) => a.isPrimary) ?? assignments[0];

    // Nav is the union across roles, led by the primary role's order — a
    // teacher who is also Exam Coordinator sees both sets of tabs.
    const nav = new Set<string>(primary.navManifest ?? []);
    for (const a of assignments) (a.navManifest ?? []).forEach((n) => nav.add(n));

    return {
      roleCodes: [...new Set(assignments.map((a) => a.roleCode))],
      permissions: granted,
      navManifest: [...nav],
      homeScreen: primary.homeScreen ?? null,
    };
  }

  /** Null = no active subscription row; treat as unrestricted (pilot schools). */
  private async allowedModules(tx: Tx, tenantId: string): Promise<Set<string> | null> {
    const rows = await tx
      .select({ modules: plans.includedModules })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .where(and(eq(subscriptions.tenantId, tenantId), eq(subscriptions.status, 'active')))
      .limit(1);

    const modules = rows[0]?.modules;
    return modules && modules.length ? new Set(modules) : null;
  }

  /** Sections this user owns as class teacher. */
  private async classTeacherSectionIds(
    tx: Tx,
    tenantId: string,
    userId: string,
  ): Promise<string[]> {
    const rows = await tx
      .select({ sectionId: staffSectionAssignments.sectionId })
      .from(staffSectionAssignments)
      .innerJoin(staffTable, eq(staffTable.id, staffSectionAssignments.staffId))
      .where(and(eq(staffTable.userId, userId), eq(staffSectionAssignments.tenantId, tenantId)));
    return rows.map((r) => r.sectionId);
  }

  /** Section + subject pairs this user teaches. */
  private async taughtSectionsAndSubjects(
    tx: Tx,
    tenantId: string,
    userId: string,
  ): Promise<{ sectionIds: string[]; subjectIds: string[] }> {
    const rows = await tx
      .select({
        sectionId: staffSubjectAssignments.sectionId,
        subjectId: staffSubjectAssignments.subjectId,
      })
      .from(staffSubjectAssignments)
      .innerJoin(staffTable, eq(staffTable.id, staffSubjectAssignments.staffId))
      .where(and(eq(staffTable.userId, userId), eq(staffSubjectAssignments.tenantId, tenantId)));

    return {
      sectionIds: [...new Set(rows.map((r) => r.sectionId))],
      subjectIds: [...new Set(rows.map((r) => r.subjectId))],
    };
  }

  /** For family users: children this guardian may act for, or the student themself. */
  private async ownStudentIds(tx: Tx, tenantId: string, userId: string): Promise<string[]> {
    const [asGuardian, asStudent] = await Promise.all([
      tx
        .select({ studentId: studentGuardians.studentId })
        .from(studentGuardians)
        .innerJoin(guardiansTable, eq(guardiansTable.id, studentGuardians.guardianId))
        .where(and(eq(guardiansTable.userId, userId), eq(studentGuardians.tenantId, tenantId))),
      tx
        .select({ id: studentsTable.id })
        .from(studentsTable)
        .where(and(eq(studentsTable.userId, userId), eq(studentsTable.tenantId, tenantId))),
    ]);

    return [
      ...new Set([...asGuardian.map((r) => r.studentId), ...asStudent.map((r) => r.id)]),
    ];
  }

  // -------------------------------------------------------------------------

  private serialise(access: ResolvedAccess): string {
    return JSON.stringify({
      roleCodes: access.roleCodes,
      navManifest: access.navManifest,
      homeScreen: access.homeScreen,
      permissions: [...access.permissions.values()],
    });
  }

  private deserialise(raw: string): ResolvedAccess {
    const parsed = JSON.parse(raw) as {
      roleCodes: string[];
      navManifest: string[];
      homeScreen: string | null;
      permissions: GrantedPermission[];
    };
    return {
      roleCodes: parsed.roleCodes,
      navManifest: parsed.navManifest,
      homeScreen: parsed.homeScreen,
      permissions: new Map(parsed.permissions.map((p) => [p.code, p])),
    };
  }
}

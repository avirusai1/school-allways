import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, isNull } from 'drizzle-orm';

import {
  permissions,
  plans,
  rolePermissions,
  roles,
  subscriptions,
  tenantSettings,
  tenants,
} from '@saw/db';
import { PermissionResolverService } from '../../common/rbac/permission-resolver.service';
import { TenantDbService, type Tx } from '../../common/database/tenant-db.service';
import { ApiException } from '../../common/errors/api.exception';
import { publicFileUrl } from '../../common/utils/url.util';
import { FeatureFlagsService } from '../platform/feature-flags.service';
import { AuthRepository } from './auth.repository';
import type {
  PlatformSessionDto,
  SessionBranchDto,
  SessionFeaturesDto,
  SessionResponseDto,
  SessionSettingsDto,
  SessionTenantDto,
} from './dto/auth.response';

/**
 * Only the super admin is bootstrappable today. `platform_support` exists as a
 * role but has no assignment mechanism, since platform users hold no
 * `user_role_assignments` row — see `buildPlatformSession`.
 */
const PLATFORM_ROLE_CODE = 'platform_super_admin';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly db: TenantDbService,
    private readonly repo: AuthRepository,
    private readonly resolver: PermissionResolverService,
    private readonly flags: FeatureFlagsService,
  ) {}

  /**
   * The console's session, which has no school in it.
   *
   * `buildSession` needs a tenant and a branch for everything it loads — the
   * school's settings, its feature flags, the scope refs on the caller's role
   * assignment. A platform admin has none of those: `user_role_assignments`
   * requires a `tenant_id`, so there is no row to resolve, and there is no
   * school whose settings would be the right ones to return.
   *
   * So the console gets its own shape, read off the platform role itself.
   * Keeping it separate is also the honest boundary: this response cannot
   * accidentally carry a school's data because it never loads any.
   */
  async buildPlatformSession(userId: string): Promise<PlatformSessionDto> {
    const filesBaseUrl = this.config.getOrThrow<string>('FILES_BASE_URL');

    const [user, role] = await Promise.all([
      this.db.runUnscoped((tx) => this.repo.findUserById(tx, userId)),
      this.db.runUnscoped(async (tx) => {
        const [row] = await tx
          .select({
            id: roles.id,
            code: roles.code,
            name: roles.name,
            navManifest: roles.navManifest,
            homeScreen: roles.homeScreen,
          })
          .from(roles)
          .where(and(isNull(roles.tenantId), eq(roles.code, PLATFORM_ROLE_CODE)))
          .limit(1);
        return row ?? null;
      }),
    ]);

    if (!user) {
      throw new ApiException(401, 'UNAUTHENTICATED', 'Invalid or expired access token');
    }

    const permissionCodes = role
      ? await this.db.runUnscoped(async (tx) => {
          const rows = await tx
            .select({ code: permissions.code })
            .from(rolePermissions)
            .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
            .where(eq(rolePermissions.roleId, role.id));
          return rows.map((r) => r.code);
        })
      : [];

    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        displayName: user.displayName,
        photoUrl: publicFileUrl(filesBaseUrl, user.avatarPath),
        preferredLanguage: user.preferredLanguage,
        kind: user.kind,
        isMinor: user.isMinor,
      },
      roles: role ? [{ code: role.code, name: role.name, isPrimary: true }] : [],
      permissions: permissionCodes,
      navManifest: role?.navManifest ?? [],
      homeScreen: role?.homeScreen ?? 'control_home',
    };
  }

  async buildSession(
    userId: string,
    tenantId: string,
    branchId: string,
  ): Promise<SessionResponseDto> {
    const filesBaseUrl = this.config.getOrThrow<string>('FILES_BASE_URL');

    const [context, access, resolvedFlags] = await Promise.all([
      this.db.asTenant(tenantId, (tx) => this.loadTenantContext(tx, tenantId, branchId, userId)),
      this.resolver.resolve(tenantId, userId, branchId),
      // A flags failure must not block sign-in, but it must not be invisible
      // either: missing table grants made this throw for every school and the
      // silent fallback meant every session looked healthy while shipping zero
      // flags. Degrade the same way, just say so first.
      this.flags.resolveForTenant(tenantId).catch((err: unknown) => {
        this.logger.error(
          `Feature flag resolution failed for tenant=${tenantId}; serving no flags for this session: ` +
            (err instanceof Error ? err.message : String(err)),
          err instanceof Error ? err.stack : undefined,
        );
        return {} as Record<string, unknown>;
      }),
    ]);

    const permissions = [...access.permissions.keys()];
    const grant = access.permissions.values().next().value;

    return {
      user: {
        id: context.user.id,
        fullName: context.user.fullName,
        displayName: context.user.displayName,
        photoUrl: publicFileUrl(filesBaseUrl, context.user.avatarPath),
        preferredLanguage: context.user.preferredLanguage,
        kind: context.user.kind,
        isMinor: context.user.isMinor,
      },
      tenant: context.tenant,
      branch: context.branch,
      roles: context.roles,
      permissions,
      scopes: {
        sectionIds: grant?.sectionIds ?? [],
        subjectIds: grant?.subjectIds ?? [],
        studentIds: grant?.studentIds ?? [],
      },
      navManifest: access.navManifest,
      homeScreen: access.homeScreen,
      features: this.mergeFeatures(context.features, resolvedFlags),
      settings: context.settings,
    };
  }

  private async loadTenantContext(
    tx: Tx,
    tenantId: string,
    branchId: string,
    userId: string,
  ) {
    const [user, tenantRow, branch, roles, settingsRows, planModules, academicSession] =
      await Promise.all([
        this.repo.findUserById(tx, userId),
        tx
          .select({
            id: tenants.id,
            name: tenants.name,
            slug: tenants.slug,
            logoPath: tenants.logoPath,
            primaryColor: tenants.primaryColor,
            onboardingCompletedAt: tenants.onboardingCompletedAt,
            status: tenants.status,
          })
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1)
          .then((rows) => rows[0] ?? null),
        this.repo.findBranch(tx, branchId),
        this.repo.listUserRoles(tx, tenantId, userId, branchId),
        tx
          .select({ key: tenantSettings.key, value: tenantSettings.value })
          .from(tenantSettings)
          .where(eq(tenantSettings.tenantId, tenantId)),
        tx
          .select({ modules: plans.includedModules })
          .from(subscriptions)
          .innerJoin(plans, eq(plans.id, subscriptions.planId))
          .where(and(eq(subscriptions.tenantId, tenantId), eq(subscriptions.status, 'active')))
          .limit(1)
          .then((rows) => rows[0]?.modules ?? null),
        this.repo.findCurrentAcademicSession(tx, tenantId, branchId),
      ]);

    if (!user || !tenantRow || !branch) {
      throw new Error('Session context incomplete');
    }

    if (
      user.kind !== 'guardian' &&
      user.kind !== 'student' &&
      user.kind !== 'platform' &&
      tenantRow.status === 'suspended'
    ) {
      throw new ApiException(
        403,
        'TENANT_SUSPENDED',
        'This school is temporarily suspended. Contact School All Ways support.',
      );
    }

    const settingsMap = new Map(settingsRows.map((s) => [s.key, s.value]));
    const modules = planModules ? new Set(planModules) : null;

    const tenant: SessionTenantDto = {
      id: tenantRow.id,
      name: tenantRow.name,
      slug: tenantRow.slug,
      logoUrl: publicFileUrl(this.config.getOrThrow('FILES_BASE_URL'), tenantRow.logoPath),
      primaryColor: tenantRow.primaryColor,
      board: branch.board,
      currentAcademicSessionId: academicSession?.id ?? null,
      currentAcademicSessionName: academicSession?.name ?? null,
      onboardingCompletedAt: tenantRow.onboardingCompletedAt?.toISOString() ?? null,
    };

    const branchDto: SessionBranchDto = {
      id: branch.id,
      name: branch.name,
      code: branch.code,
    };

    const settings: SessionSettingsDto = {
      attendanceMode: String(settingsMap.get('attendance.mode') ?? 'daily'),
      quietHoursStart: String(
        settingsMap.get('comms.quiet_hours_start') ??
          this.config.get('COMMS_QUIET_HOURS_START') ??
          '21:00',
      ),
      quietHoursEnd: String(
        settingsMap.get('comms.quiet_hours_end') ??
          this.config.get('COMMS_QUIET_HOURS_END') ??
          '07:00',
      ),
    };

    const features: SessionFeaturesDto = {
      safeReporting: settingsMap.get('safe_reporting.enabled') === true,
      transport: !modules || modules.has('D2'),
      books: !modules || modules.has('C4'),
      canteen: settingsMap.get('canteen.enabled') === true,
      onlinePayments: !modules || modules.has('B8'),
    };

    return { user, tenant, branch: branchDto, roles, settings, features };
  }

  /**
   * Plan modules remain the baseline; platform flags can kill or override
   * (e.g. transport trial for Free, or kill switch at 2am).
   */
  private mergeFeatures(
    baseline: SessionFeaturesDto,
    flags: Record<string, unknown>,
  ): SessionFeaturesDto {
    const flag = (key: string, fallback: boolean) =>
      key in flags ? Boolean(flags[key]) : fallback;

    return {
      safeReporting: flag('safe_reporting', baseline.safeReporting),
      transport: flag('module.transport', baseline.transport),
      books: flag('module.books', baseline.books),
      canteen: flag('canteen', baseline.canteen),
      onlinePayments: flag('module.online_payments', baseline.onlinePayments),
    };
  }
}

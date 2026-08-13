/**
 * Seed runner.
 *
 * IDEMPOTENT — safe to run on every deploy. Uses upserts keyed on natural
 * keys, so adding a permission or tweaking a role bundle is just a re-run.
 *
 * Runs as the OWNER role (DATABASE_URL), not the app role, because it writes
 * global rows with tenant_id NULL, which the RLS WITH CHECK clause forbids to
 * the app role by design.
 *
 *   pnpm db:seed
 */

import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import {
  consentPurposes,
  notificationTemplates,
  permissions as permissionsTable,
  plans as plansTable,
  rolePermissions,
  roles as rolesTable,
  subscriptions,
  tenants,
  userRoleAssignments,
} from '../schema/index';
import { PERMISSIONS, assertNoDuplicates } from './permissions';
import { SYSTEM_ROLES, resolvePermissionCodes, resolveScope } from './roles';
import { CONSENT_PURPOSES, PLANS } from './catalogues';
import { NOTIFICATION_TEMPLATES } from './notification-templates';
import { invalidatePermissionCaches } from './invalidate-perm-cache';
import { assertPlatformRoleSeeded, seedPlatformAdmin } from './platform-admin';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Seeds run as the owner role.');
}

const client = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(client);

function log(step: string, detail = '') {
  process.stdout.write(`  ${step.padEnd(34)} ${detail}\n`);
}

async function seedPermissions() {
  assertNoDuplicates();

  for (const perm of PERMISSIONS) {
    await db
      .insert(permissionsTable)
      .values({
        code: perm.code,
        moduleCode: perm.moduleCode,
        resource: perm.resource,
        action: perm.action,
        description: perm.description,
        sensitivity: perm.sensitivity ?? 'normal',
        allowedScopes: perm.scopes ?? [],
      })
      .onConflictDoUpdate({
        target: permissionsTable.code,
        set: {
          moduleCode: perm.moduleCode,
          description: perm.description,
          sensitivity: perm.sensitivity ?? 'normal',
          allowedScopes: perm.scopes ?? [],
          updatedAt: new Date(),
        },
      });
  }

  const restricted = PERMISSIONS.filter((p) => p.sensitivity === 'restricted').length;
  log('permissions', `${PERMISSIONS.length} (${restricted} restricted)`);
}

/**
 * `roles_tenant_code_uq` is a plain unique index on (tenant_id, code), and
 * Postgres treats NULLs as distinct — so for system roles, which carry
 * tenant_id NULL by design, ON CONFLICT never matched and every `db:seed` run
 * inserted a fresh copy of all 31 roles instead of updating them.
 *
 * That is worse than row bloat: `user_role_assignments.role_id` points at
 * whichever copy existed the day the user was assigned, so edits to a role's
 * permissions or navigation silently had no effect on anyone already using it.
 *
 * Find-or-update by code, and fold any copies a previous run left behind back
 * into the oldest row, which is the one live assignments are most likely on.
 */
async function upsertSystemRole(
  role: (typeof SYSTEM_ROLES)[number],
): Promise<{ id: string; removed: number }> {
  const fields = {
    name: role.name,
    description: role.description,
    cluster: role.cluster,
    appTarget: role.appTarget,
    homeScreen: role.homeScreen,
    navManifest: role.nav,
  };

  const existing = await db
    .select({ id: rolesTable.id })
    .from(rolesTable)
    .where(and(isNull(rolesTable.tenantId), eq(rolesTable.code, role.code)))
    .orderBy(asc(rolesTable.createdAt));

  if (existing.length === 0) {
    const [inserted] = await db
      .insert(rolesTable)
      .values({ tenantId: null, code: role.code, isSystem: true, ...fields })
      .returning({ id: rolesTable.id });
    return { id: inserted.id, removed: 0 };
  }

  const canonical = existing[0].id;
  const copies = existing.slice(1).map((r) => r.id);

  if (copies.length > 0) {
    // The FK is ON DELETE RESTRICT, so assignments must move first. There is
    // no unique key on (user, role), and the resolver keeps the widest scope,
    // so a user who somehow held two copies simply keeps the wider grant.
    await db
      .update(userRoleAssignments)
      .set({ roleId: canonical })
      .where(inArray(userRoleAssignments.roleId, copies));
    // role_permissions cascades.
    await db.delete(rolesTable).where(inArray(rolesTable.id, copies));
  }

  await db
    .update(rolesTable)
    .set({ ...fields, isSystem: true, updatedAt: new Date() })
    .where(eq(rolesTable.id, canonical));

  return { id: canonical, removed: copies.length };
}

async function seedRoles() {
  const allCodes = PERMISSIONS.map((p) => p.code);

  // code -> id, for the mapping table
  const permRows = await db
    .select({ id: permissionsTable.id, code: permissionsTable.code })
    .from(permissionsTable);
  const permIdByCode = new Map(permRows.map((r) => [r.code, r.id]));

  let totalMappings = 0;
  let deduped = 0;

  for (const role of SYSTEM_ROLES) {
    const { id: roleId, removed } = await upsertSystemRole(role);
    deduped += removed;
    const codes = resolvePermissionCodes(role.permissions, allCodes);

    // Replace the bundle wholesale — a removed permission must actually go.
    await db.delete(rolePermissions).where(sql`${rolePermissions.roleId} = ${roleId}`);

    // Scope is resolved PER PERMISSION, not blanket-applied from the role.
    // See resolveScope() for why — a Subject Teacher's `subject` default is
    // illegal for most permissions and must land on `section`, not `branch`.
    const scopeCounts: Record<string, number> = {};

    for (const code of codes) {
      const permissionId = permIdByCode.get(code);
      const permission = PERMISSIONS.find((p) => p.code === code);
      if (!permissionId || !permission) continue;

      const scope = resolveScope(
        role.code,
        code,
        role.defaultScope,
        (permission.scopes ?? []) as never,
      );
      scopeCounts[scope] = (scopeCounts[scope] ?? 0) + 1;

      await db.insert(rolePermissions).values({
        tenantId: null,
        roleId,
        permissionId,
        defaultScope: scope,
      });
    }

    totalMappings += codes.length;
    const breakdown = Object.entries(scopeCounts)
      .map(([s, n]) => `${n}@${s}`)
      .join(' ');
    log(`role: ${role.code}`, `${codes.length} perms  ${breakdown}`);
  }

  log(
    'roles total',
    `${SYSTEM_ROLES.length} roles, ${totalMappings} mappings` +
      (deduped > 0 ? `, ${deduped} duplicate role rows folded in` : ''),
  );
}

async function migratePlanSubscriptions(fromCode: string, toCode: string) {
  const [fromPlan] = await db
    .select({ id: plansTable.id })
    .from(plansTable)
    .where(eq(plansTable.code, fromCode))
    .limit(1);
  const [toPlan] = await db
    .select({ id: plansTable.id })
    .from(plansTable)
    .where(eq(plansTable.code, toCode))
    .limit(1);
  if (!fromPlan || !toPlan || fromPlan.id === toPlan.id) return 0;

  const updated = await db
    .update(subscriptions)
    .set({ planId: toPlan.id, updatedAt: new Date() })
    .where(eq(subscriptions.planId, fromPlan.id))
    .returning({ id: subscriptions.id });
  return updated.length;
}

async function seedPlans() {
  for (const plan of PLANS) {
    await db
      .insert(plansTable)
      .values({
        code: plan.code,
        name: plan.name,
        tier: plan.tier,
        pricePerStudentYear: plan.pricePerStudentYear,
        maxStudents: plan.maxStudents,
        maxBranches: plan.maxBranches,
        includedModules: plan.includedModules,
        isPublic: plan.isPublic,
      })
      .onConflictDoUpdate({
        target: plansTable.code,
        set: {
          name: plan.name,
          tier: plan.tier,
          pricePerStudentYear: plan.pricePerStudentYear,
          includedModules: plan.includedModules,
          maxBranches: plan.maxBranches,
          isPublic: plan.isPublic,
          updatedAt: new Date(),
        },
      });
  }

  // Parent-paid model: every public school plan collapses onto `free`.
  const retired = ['basic', 'standard', 'pro'] as const;
  let moved = 0;
  for (const code of retired) {
    moved += await migratePlanSubscriptions(code, 'free');
  }
  const remaining = await db
    .select({
      code: plansTable.code,
      n: sql<number>`count(${subscriptions.id})::int`,
    })
    .from(plansTable)
    .leftJoin(subscriptions, eq(subscriptions.planId, plansTable.id))
    .where(inArray(plansTable.code, [...retired]))
    .groupBy(plansTable.code);
  const dangling = remaining.filter((r) => r.n > 0);
  if (dangling.length > 0) {
    throw new Error(
      `Refusing to delete plans still referenced by subscriptions: ${dangling
        .map((d) => `${d.code}=${d.n}`)
        .join(', ')}`,
    );
  }
  await db.delete(plansTable).where(inArray(plansTable.code, [...retired]));
  if (moved > 0) log('plan migrations', `${moved} subscriptions → free`);

  await db
    .update(tenants)
    .set({ planTier: 'free', updatedAt: new Date() })
    .where(inArray(tenants.planTier, ['standard', 'pro']));

  log('plans', `${PLANS.length}`);
}

async function seedConsentPurposes() {
  for (const purpose of CONSENT_PURPOSES) {
    await db
      .insert(consentPurposes)
      .values({
        code: purpose.code,
        name: purpose.name,
        description: purpose.description,
        translations: purpose.translations,
        isEssential: purpose.isEssential,
        category: purpose.category,
        retentionDays: purpose.retentionDays,
      })
      .onConflictDoUpdate({
        target: consentPurposes.code,
        set: {
          name: purpose.name,
          description: purpose.description,
          translations: purpose.translations,
          isEssential: purpose.isEssential,
          retentionDays: purpose.retentionDays,
          updatedAt: new Date(),
        },
      });
  }
  const essential = CONSENT_PURPOSES.filter((p) => p.isEssential).length;
  log('consent purposes', `${CONSENT_PURPOSES.length} (${essential} essential)`);
}

/**
 * System templates are keyed on (tenant_id, code, channel, language) with
 * tenant_id NULL. Postgres treats NULLs as distinct in a unique index, so
 * ON CONFLICT never matched for these rows: every seed run inserted another
 * copy, and no edit to the wording ever reached a database that had already
 * been seeded. Local had eleven copies of each template and was still sending
 * the oldest one.
 *
 * Same find-canonical-then-collapse shape the role seed uses, for the same
 * reason. Nothing holds an FK to a template row, so the copies can just go.
 */
async function seedNotificationTemplates() {
  let updated = 0;
  let inserted = 0;
  let removed = 0;

  for (const tpl of NOTIFICATION_TEMPLATES) {
    const fields = {
      subject: tpl.subject,
      body: tpl.body,
      variables: tpl.variables,
      updatedAt: new Date(),
    };

    const existing = await db
      .select({ id: notificationTemplates.id })
      .from(notificationTemplates)
      .where(
        and(
          isNull(notificationTemplates.tenantId),
          eq(notificationTemplates.code, tpl.code),
          eq(notificationTemplates.channel, tpl.channel),
          eq(notificationTemplates.language, 'en'),
        ),
      )
      .orderBy(asc(notificationTemplates.createdAt));

    if (existing.length === 0) {
      await db.insert(notificationTemplates).values({
        tenantId: null,
        code: tpl.code,
        channel: tpl.channel,
        language: 'en',
        ...fields,
      });
      inserted += 1;
      continue;
    }

    const [canonical, ...copies] = existing;
    await db
      .update(notificationTemplates)
      .set(fields)
      .where(eq(notificationTemplates.id, canonical.id));
    updated += 1;

    if (copies.length > 0) {
      await db.delete(notificationTemplates).where(
        inArray(
          notificationTemplates.id,
          copies.map((c) => c.id),
        ),
      );
      removed += copies.length;
    }
  }

  const codes = new Set(NOTIFICATION_TEMPLATES.map((t) => t.code));
  log(
    'notification templates',
    `${NOTIFICATION_TEMPLATES.length} (${codes.size} codes) · ${inserted} new, ${updated} updated` +
      (removed > 0 ? `, ${removed} duplicate rows removed` : ''),
  );
}

/**
 * Post-seed guard. Catches the class of mistake where a role bundle
 * accidentally picks up a restricted permission through a wildcard.
 */
async function verifyRestrictedAccess() {
  const RESTRICTED = PERMISSIONS.filter((p) => p.sensitivity === 'restricted').map((p) => p.code);
  const ALLOWED_ROLES = ['special_educator', 'platform_super_admin'];

  const rows = await db
    .select({ roleCode: rolesTable.code, permCode: permissionsTable.code })
    .from(rolePermissions)
    .innerJoin(rolesTable, sql`${rolesTable.id} = ${rolePermissions.roleId}`)
    .innerJoin(permissionsTable, sql`${permissionsTable.id} = ${rolePermissions.permissionId}`)
    .where(sql`${permissionsTable.sensitivity} = 'restricted'`);

  const violations = rows.filter((r) => !ALLOWED_ROLES.includes(r.roleCode));
  if (violations.length) {
    throw new Error(
      'Restricted permissions leaked into roles that should not hold them:\n' +
        violations.map((v) => `  ${v.roleCode} -> ${v.permCode}`).join('\n'),
    );
  }
  log('restricted-access check', `OK (${RESTRICTED.length} restricted perms)`);
}

async function main() {
  process.stdout.write('\nSeeding School All Ways catalogues\n\n');
  await seedPermissions();
  await seedPlans();
  await seedConsentPurposes();
  await seedNotificationTemplates();
  await seedRoles();
  await verifyRestrictedAccess();

  await assertPlatformRoleSeeded(db);
  const admin = await seedPlatformAdmin(db);
  log(
    'platform admin',
    admin.status === 'skipped' ? `skipped — ${admin.reason}` : `${admin.status} ${admin.email}`,
  );

  // Role bundles just changed in Postgres; bust API grant caches so a live
  // process picks up new codes (e.g. staff.account.issue) without a manual
  // redis-cli flush or waiting out the 5-minute TTL.
  await invalidatePermissionCaches(process.env.REDIS_URL, log);

  process.stdout.write('\nDone.\n\n');
  await client.end();
}

main().catch(async (err) => {
  process.stderr.write(`\nSeed failed: ${err instanceof Error ? err.message : String(err)}\n\n`);
  await client.end();
  process.exit(1);
});

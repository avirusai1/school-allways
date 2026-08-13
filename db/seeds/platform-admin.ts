/**
 * Bootstraps one real person into the platform console.
 *
 * `platform_super_admin` has existed as a role since the RBAC seed was written,
 * with nobody assigned to it, so the console at `apps/web-control` has never
 * had a way in. This closes that — for local and staging only.
 *
 * Credentials come from the environment, never from this file. An account with
 * cross-tenant reach over every school on the platform is not something to
 * commit a password for, and a default password in a repo is a default password
 * in production eventually.
 *
 * Unset env => skip quietly. CI and a fresh clone neither need this account nor
 * should fail without it.
 *
 * Production provisioning is deliberately out of scope: it wants hardware keys,
 * a rotation story and two people, none of which belong in a seed script.
 */

import * as argon2 from 'argon2';
import { and, eq, isNull } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import { roles as rolesTable, users } from '../schema/index';

/** Long enough that a leaked staging password is not also a dictionary word. */
const MIN_PASSWORD_LENGTH = 12;

export type PlatformAdminResult =
  | { status: 'skipped'; reason: string }
  | { status: 'created' | 'updated'; email: string };

export async function seedPlatformAdmin(
  db: PostgresJsDatabase<Record<string, never>>,
): Promise<PlatformAdminResult> {
  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.PLATFORM_ADMIN_PASSWORD;

  if (!email || !password) {
    return {
      status: 'skipped',
      reason: 'PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD not set',
    };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `PLATFORM_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }

  // The console is gated on the JWT's `pa` claim, and `auth.service.ts` sets
  // that from `users.kind === 'platform'` alone. Nothing else grants console
  // access, so nothing else needs to be true for this account to work.
  const [existing] = await db
    .select({ id: users.id, kind: users.kind })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  // Refuse to promote a school's user into a platform admin by a typo in an
  // env var. Whoever meant to do that can do it deliberately.
  if (existing && existing.kind !== 'platform') {
    throw new Error(
      `PLATFORM_ADMIN_EMAIL '${email}' already belongs to a '${existing.kind}' ` +
        'account. Refusing to convert it. Use a dedicated address.',
    );
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  if (existing) {
    // Find-or-update by email, never insert-on-every-run: re-seeding must
    // rotate the password of the same account, not accumulate accounts.
    await db
      .update(users)
      .set({
        passwordHash,
        isActive: true,
        failedLoginCount: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id));

    return { status: 'updated', email };
  }

  await db.insert(users).values({
    email,
    emailVerifiedAt: new Date(),
    passwordHash,
    fullName: process.env.PLATFORM_ADMIN_NAME?.trim() || 'Platform Admin',
    kind: 'platform',
    isMinor: false,
  });

  return { status: 'created', email };
}

/**
 * `user_role_assignments.tenant_id` is NOT NULL with an FK to `tenants`, so a
 * platform role cannot be assigned the way a school role is — there is no
 * tenant to hang it off. The role row itself is the record of what a platform
 * user may do, and `getPlatformSession()` reads it directly.
 *
 * Asserted here rather than assumed, because the console's permission list
 * comes from this row and an unseeded role would hand back an empty one.
 */
export async function assertPlatformRoleSeeded(
  db: PostgresJsDatabase<Record<string, never>>,
): Promise<void> {
  const [role] = await db
    .select({ id: rolesTable.id })
    .from(rolesTable)
    .where(and(isNull(rolesTable.tenantId), eq(rolesTable.code, 'platform_super_admin')))
    .limit(1);

  if (!role) {
    throw new Error(
      'platform_super_admin role is missing. Run the role seed before bootstrapping an admin.',
    );
  }
}

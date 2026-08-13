/**
 * Module A3 — Roles & permissions. FULLY DATA-DRIVEN (your decision #1).
 *
 * There is NO role enum in this codebase. A role is a row. Permissions are
 * rows. Custom roles are just rows a school created. The 26 documented roles
 * ship as seeded `is_system = true` rows that schools can clone but not delete.
 *
 * THREE THINGS THAT MAKE THIS NON-TRIVIAL
 * ---------------------------------------
 * 1. Multi-assignable. One teacher is a Class Teacher AND Exam Coordinator.
 *    Permissions are UNIONed across all active assignments.
 *
 * 2. Time-bounded. "Class teacher of 5B" expires 31 March. Assignments carry
 *    academic_session_id + valid_from/valid_to. Expired ≠ deleted; we keep
 *    history because audit logs reference it.
 *
 * 3. Data-scoped. `students.read` is meaningless without scope. Every
 *    assignment carries a scope describing WHICH rows it applies to:
 *      - tenant  : all branches
 *      - branch  : one branch
 *      - section : only assigned sections (the Class/Subject Teacher case)
 *      - self    : only own record
 *
 * Permission strings are `<module>.<resource>.<action>`, e.g.
 *   attendance.student.mark
 *   fee.invoice.read
 *   counselling.note.read        <- restricted tier
 */

import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { actorstamps, isActive, pk, sensitivityEnum, timestamps } from './_common';
import { branches, tenants } from './01-tenancy';
import { users } from './02-identity';

export const scopeTypeEnum = pgEnum('scope_type', [
  'tenant',
  'branch',
  'section',
  'subject',
  'self',
]);

export const roleClusterEnum = pgEnum('role_cluster', [
  'leadership',
  'coordination',
  'admin',
  'admissions',
  'finance',
  'hr',
  'teaching',
  'support',
  'safety',
  'transport',
  'family',
  'platform',
]);

// ---------------------------------------------------------------------------
// Permissions — global catalogue, NOT tenant-scoped
// ---------------------------------------------------------------------------

export const permissions = pgTable(
  'permissions',
  {
    id: pk(),
    /** e.g. 'attendance.student.mark' */
    code: varchar('code', { length: 100 }).notNull(),
    /** Module code from the catalogue, e.g. 'B3'. Drives plan gating (A13). */
    moduleCode: varchar('module_code', { length: 10 }).notNull(),
    resource: varchar('resource', { length: 60 }).notNull(),
    action: varchar('action', { length: 30 }).notNull(),
    description: text('description'),

    /**
     * Restricted permissions (counselling notes, POSH, safe reports) require
     * an extra per-record grant AND write a pii_access_log row on every read.
     */
    sensitivity: sensitivityEnum('sensitivity').notNull().default('normal'),

    /** Which scope types are legal for this permission. */
    allowedScopes: jsonb('allowed_scopes').$type<string[]>().notNull().default([]),

    ...timestamps,
  },
  (t) => ({
    codeUq: uniqueIndex('permissions_code_uq').on(t.code),
    moduleIdx: index('permissions_module_idx').on(t.moduleCode),
  }),
);

// ---------------------------------------------------------------------------
// Roles — seeded system roles + school-created custom roles
// ---------------------------------------------------------------------------

export const roles = pgTable(
  'roles',
  {
    id: pk(),
    /**
     * NULL for the 26 seeded system roles (shared by all tenants).
     * Set for custom roles a school created.
     */
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),

    code: varchar('code', { length: 60 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    cluster: roleClusterEnum('cluster').notNull(),

    /** System roles cannot be deleted or renamed; they can be CLONED. */
    isSystem: boolean('is_system').notNull().default(false),
    /** Which app this role's holder logs into: 'admin' | 'family' | 'control'. */
    appTarget: varchar('app_target', { length: 20 }).notNull().default('admin'),

    /** Default landing screen key for the role-driven navigation manifest. */
    homeScreen: varchar('home_screen', { length: 60 }),
    /** Ordered nav item keys the client renders. Server-driven — see docs. */
    navManifest: jsonb('nav_manifest').$type<string[]>().notNull().default([]),

    isActive: isActive(),
    ...timestamps,
    ...actorstamps,
  },
  (t) => ({
    /**
     * NULLS NOT DISTINCT, because system roles carry tenant_id = NULL and the
     * default (NULLS DISTINCT) means two rows with the same code and a NULL
     * tenant do not collide — the index silently permits the duplicates it
     * exists to prevent. That bit us once here and again on
     * notification_templates, so the constraint now enforces it rather than
     * every seed author having to remember.
     */
    tenantCodeUq: unique('roles_tenant_code_uq').on(t.tenantId, t.code).nullsNotDistinct(),
    tenantIdx: index('roles_tenant_idx').on(t.tenantId),
  }),
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    id: pk(),
    /**
     * Mirrors roles.tenantId: NULL for system-role mappings (shared), set for
     * a school's custom role. Denormalised on purpose — without it this table
     * has no tenant_id and therefore gets NO row-level security, which would
     * let one school read another school's custom-role permission mappings.
     * Keep it in sync with the parent role on write.
     */
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),

    /** Default scope granted when this role is assigned. Overridable per assignment. */
    defaultScope: scopeTypeEnum('default_scope').notNull().default('branch'),

    ...timestamps,
  },
  (t) => ({
    uq: uniqueIndex('role_permissions_uq').on(t.roleId, t.permissionId),
    roleIdx: index('role_permissions_role_idx').on(t.roleId),
  }),
);

// ---------------------------------------------------------------------------
// Role assignments — the time- and scope-bounded grant
// ---------------------------------------------------------------------------

export const userRoleAssignments = pgTable(
  'user_role_assignments',
  {
    id: pk(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),

    /** Null = all branches in tenant. */
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'cascade' }),

    scopeType: scopeTypeEnum('scope_type').notNull().default('branch'),
    /**
     * Concrete scope targets when scopeType is section/subject.
     * e.g. { "sectionIds": ["..."], "subjectIds": ["..."] }
     * Resolved into SQL predicates by the query builder — never trusted raw.
     */
    scopeRefs: jsonb('scope_refs').$type<Record<string, string[]>>().default({}),

    /** Assignments are academic-session bound. See rationale above. */
    academicSessionId: uuid('academic_session_id'),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull().defaultNow(),
    validTo: timestamp('valid_to', { withTimezone: true }),

    /** Marks the role a user sees first if they hold several. */
    isPrimary: boolean('is_primary').notNull().default(false),

    ...timestamps,
    ...actorstamps,
  },
  (t) => ({
    userIdx: index('ura_user_idx').on(t.userId),
    tenantUserIdx: index('ura_tenant_user_idx').on(t.tenantId, t.userId),
    roleIdx: index('ura_role_idx').on(t.roleId),
    validityIdx: index('ura_validity_idx').on(t.validFrom, t.validTo),
  }),
);

/**
 * Per-record grant for `restricted` data (counselling cases, POSH, safe reports).
 * Holding `counselling.note.read` is NOT enough — you also need a row here.
 * This is what keeps the Principal out of counselling notes (your decision #5).
 */
export const recordAccessGrants = pgTable(
  'record_access_grants',
  {
    id: pk(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** Table name + row id of the restricted record. */
    resourceType: varchar('resource_type', { length: 60 }).notNull(),
    resourceId: uuid('resource_id').notNull(),

    /** 'read' | 'write' | 'indicator_only' */
    accessLevel: varchar('access_level', { length: 20 }).notNull().default('read'),
    reason: text('reason'),

    grantedBy: uuid('granted_by').references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),

    ...timestamps,
  },
  (t) => ({
    lookupIdx: index('rag_lookup_idx').on(t.tenantId, t.userId, t.resourceType, t.resourceId),
  }),
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const rolesRelations = relations(roles, ({ many, one }) => ({
  permissions: many(rolePermissions),
  assignments: many(userRoleAssignments),
  tenant: one(tenants, { fields: [roles.tenantId], references: [tenants.id] }),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}));

export const userRoleAssignmentsRelations = relations(userRoleAssignments, ({ one }) => ({
  user: one(users, { fields: [userRoleAssignments.userId], references: [users.id] }),
  role: one(roles, { fields: [userRoleAssignments.roleId], references: [roles.id] }),
  branch: one(branches, {
    fields: [userRoleAssignments.branchId],
    references: [branches.id],
  }),
}));

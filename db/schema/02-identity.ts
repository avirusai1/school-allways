/**
 * Module A3 — Identity & authentication.
 *
 * EMAIL INVITE + PASSWORD is the only login. Staff, students, and parents
 * all receive a join link by email, set their own password, and sign in with
 * that email + password afterwards. Phone stays on the record as a contact
 * field (SMS/WhatsApp, emergency). It is not a credential.
 *
 * (The original phone-first design was written because many Indian parents
 * have no email. That product decision was reversed on 2026-08-18.)
 *
 * IMPORTANT — one human, one user row, many roles, many tenants.
 * A parent with children in two different schools on our platform has ONE
 * user row and two `user_tenant_memberships`. This is why `users` is NOT
 * tenant-scoped and is one of the three exceptions to the tenant_id rule.
 * All *authorisation* is tenant-scoped via memberships + role assignments.
 */

import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  inet,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
  integer,
} from 'drizzle-orm/pg-core';
import {
  actorstamps,
  isActive,
  languageEnum,
  phoneCol,
  pk,
  timestamps,
} from './_common';
import { branches, tenants } from './01-tenancy';

export const userKindEnum = pgEnum('user_kind', [
  'staff',
  'guardian',
  'student',
  'platform', // our own team
]);

export const membershipStatusEnum = pgEnum('membership_status', [
  'invited',
  'active',
  'suspended',
  'left',
]);

// ---------------------------------------------------------------------------
// Users — global identity
// ---------------------------------------------------------------------------

export const users = pgTable(
  'users',
  {
    id: pk(),

    /** E.164 without '+'. Contact field — not a login credential. */
    phone: phoneCol('phone'),
    phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),

    /** Primary login identifier after the invite is activated. */
    email: varchar('email', { length: 254 }),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),

    /** Argon2id. Null until the person sets a password via the join link. */
    passwordHash: text('password_hash'),

    fullName: varchar('full_name', { length: 150 }).notNull(),
    displayName: varchar('display_name', { length: 100 }),
    avatarPath: text('avatar_path'),
    preferredLanguage: languageEnum('preferred_language').notNull().default('en'),

    kind: userKindEnum('kind').notNull(),

    /**
     * DPDP: TRUE if this user is under 18. Gates behavioural analytics,
     * ad SDKs (we ship none) and self-service consent. Recomputed nightly
     * from date_of_birth on the linked student record.
     */
    isMinor: boolean('is_minor').notNull().default(false),

    /** Brute-force protection. */
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),

    isActive: isActive(),
    ...timestamps,
    ...actorstamps,
  },
  (t) => ({
    phoneUq: uniqueIndex('users_phone_uq').on(t.phone),
    emailUq: uniqueIndex('users_email_uq').on(t.email),
    kindIdx: index('users_kind_idx').on(t.kind),
  }),
);

// ---------------------------------------------------------------------------
// Tenant membership — which schools this human belongs to
// ---------------------------------------------------------------------------

export const userTenantMemberships = pgTable(
  'user_tenant_memberships',
  {
    id: pk(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** Null = access to all branches in the tenant (group owner, trustee). */
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'cascade' }),

    status: membershipStatusEnum('status').notNull().default('invited'),
    invitedAt: timestamp('invited_at', { withTimezone: true }),
    joinedAt: timestamp('joined_at', { withTimezone: true }),
    leftAt: timestamp('left_at', { withTimezone: true }),

    /** Staff employee code / student admission no — for display in pickers. */
    memberCode: varchar('member_code', { length: 50 }),

    ...timestamps,
    ...actorstamps,
  },
  (t) => ({
    /**
     * NULLS NOT DISTINCT — branch_id IS NULL means "tenant-wide membership".
     * Without it a user can hold two all-branches memberships for the same
     * school, and role resolution sees whichever row the query hits first.
     */
    uq: unique('memberships_tenant_user_branch_uq')
      .on(t.tenantId, t.userId, t.branchId)
      .nullsNotDistinct(),
    userIdx: index('memberships_user_idx').on(t.userId),
    tenantIdx: index('memberships_tenant_idx').on(t.tenantId),
  }),
);

// ---------------------------------------------------------------------------
// OTP
// ---------------------------------------------------------------------------

export const otpPurposeEnum = pgEnum('otp_purpose', [
  'login',
  'signup',
  'phone_change',
  'password_reset',
  'guardian_consent',   // DPDP verifiable parental consent
  'pickup_handover',    // D2 one-time pickup code
  'payment_confirm',
]);

export const otpCodes = pgTable(
  'otp_codes',
  {
    id: pk(),
    /** Nullable: signup OTP fires before a user row exists. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    /**
     * At least one of phone/email is set. Phone stays the import identifier;
     * email is the funded delivery channel (Gmail SMTP).
     */
    phone: phoneCol('phone'),
    email: varchar('email', { length: 254 }),
    purpose: otpPurposeEnum('purpose').notNull(),

    /** SHA-256 of the code. Never store the plaintext OTP. */
    codeHash: varchar('code_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    attemptCount: integer('attempt_count').notNull().default(0),

    /** Arbitrary payload, e.g. {studentId} for a pickup handover code. */
    context: jsonb('context').$type<Record<string, unknown>>(),

    requestIp: inet('request_ip'),
    ...timestamps,
  },
  (t) => ({
    phonePurposeIdx: index('otp_phone_purpose_idx').on(t.phone, t.purpose),
    emailPurposeIdx: index('otp_email_purpose_idx').on(t.email, t.purpose),
    expiryIdx: index('otp_expiry_idx').on(t.expiresAt),
  }),
);

// ---------------------------------------------------------------------------
// Sessions & refresh tokens
// ---------------------------------------------------------------------------

export const sessions = pgTable(
  'sessions',
  {
    id: pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** Tenant this session is currently acting within (multi-school switcher). */
    activeTenantId: uuid('active_tenant_id').references(() => tenants.id, {
      onDelete: 'cascade',
    }),
    activeBranchId: uuid('active_branch_id').references(() => branches.id, {
      onDelete: 'cascade',
    }),

    /** SHA-256 of the refresh token. Rotated on every use. */
    refreshTokenHash: varchar('refresh_token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: varchar('revoked_reason', { length: 100 }),

    deviceId: varchar('device_id', { length: 100 }),
    deviceName: varchar('device_name', { length: 150 }),
    appVersion: varchar('app_version', { length: 30 }),
    platform: varchar('platform', { length: 20 }), // android | ios | web
    ip: inet('ip'),
    userAgent: text('user_agent'),

    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    tokenUq: uniqueIndex('sessions_refresh_hash_uq').on(t.refreshTokenHash),
    userIdx: index('sessions_user_idx').on(t.userId),
    expiryIdx: index('sessions_expiry_idx').on(t.expiresAt),
  }),
);

// ---------------------------------------------------------------------------
// Push notification device tokens (A6)
// ---------------------------------------------------------------------------

export const deviceTokens = pgTable(
  'device_tokens',
  {
    id: pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),

    fcmToken: text('fcm_token').notNull(),
    platform: varchar('platform', { length: 20 }).notNull(),
    appId: varchar('app_id', { length: 60 }).notNull(), // family | admin
    deviceId: varchar('device_id', { length: 100 }),

    isActive: isActive(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    tokenUq: uniqueIndex('device_tokens_token_uq').on(t.fcmToken),
    userIdx: index('device_tokens_user_idx').on(t.userId),
  }),
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(userTenantMemberships),
  sessions: many(sessions),
  deviceTokens: many(deviceTokens),
}));

export const membershipsRelations = relations(userTenantMemberships, ({ one }) => ({
  user: one(users, { fields: [userTenantMemberships.userId], references: [users.id] }),
  tenant: one(tenants, {
    fields: [userTenantMemberships.tenantId],
    references: [tenants.id],
  }),
  branch: one(branches, {
    fields: [userTenantMemberships.branchId],
    references: [branches.id],
  }),
}));

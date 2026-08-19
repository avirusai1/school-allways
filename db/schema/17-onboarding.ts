/**
 * Module A2 — Self-serve onboarding.
 *
 * Pre-tenant signup rows (no tenant_id) + join tokens for parent/staff deep
 * links. Growth instrumentation lives on `onboarding_events` (15-platform).
 */

import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { phoneCol, pk, timestamps } from './_common';
import { tenants, branches } from './01-tenancy';
import { users } from './02-identity';
import { students } from './05-students';

export const tenantSignups = pgTable(
  'tenant_signups',
  {
    id: pk(),
    schoolName: varchar('school_name', { length: 200 }).notNull(),
    board: varchar('board', { length: 20 }).notNull().default('cbse'),
    city: varchar('city', { length: 100 }).notNull(),
    state: varchar('state', { length: 100 }).notNull(),
    approxStudentCount: integer('approx_student_count'),

    contactName: varchar('contact_name', { length: 150 }).notNull(),
    contactPhone: phoneCol('contact_phone').notNull(),
    contactEmail: varchar('contact_email', { length: 254 }),

    referralCode: varchar('referral_code', { length: 20 }),

    /** Set when OTP verify provisions the tenant. */
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    ...timestamps,
  },
  (t) => ({
    phoneIdx: index('tenant_signups_phone_idx').on(t.contactPhone),
    expiryIdx: index('tenant_signups_expiry_idx').on(t.expiresAt),
  }),
);

/**
 * Opaque deep-link tokens: https://school.techallways.com/j/{token}
 * Parent profile completion and staff invites both use this table.
 */
export const joinTokens = pgTable(
  'join_tokens',
  {
    id: pk(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'cascade' }),

    /** SHA-256 of the opaque token shown in the URL. */
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    /**
     * 'parent_profile' | 'staff_invite' | 'student_invite' | 'signup_handoff'
     *
     * The first three are email invitations that land on /join/:token and
     * ask the person to set a password. The fourth is the cross-origin
     * handover from the public signup form to the admin app — structurally
     * identical (opaque, hashed, single-use, expiring), so it lives here
     * rather than in a second table with its own security posture.
     */
    purpose: varchar('purpose', { length: 30 }).notNull(),

    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    phone: phoneCol('phone'),

    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),

    ...timestamps,
  },
  (t) => ({
    tokenUq: uniqueIndex('join_tokens_hash_uq').on(t.tokenHash),
    tenantIdx: index('join_tokens_tenant_idx').on(t.tenantId, t.purpose),
  }),
);

/** Human escape hatch from the wizard — "Request a callback". */
export const onboardingCallbacks = pgTable(
  'onboarding_callbacks',
  {
    id: pk(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id),
    preferredTime: varchar('preferred_time', { length: 100 }),
    note: text('note'),
    /** 'open' | 'contacted' | 'closed' */
    status: varchar('status', { length: 20 }).notNull().default('open'),
    ...timestamps,
  },
  (t) => ({
    tenantIdx: index('onboarding_callbacks_tenant_idx').on(t.tenantId, t.status),
  }),
);

/** Tracks nudge cadence so we stop after day 7. */
export const onboardingNudges = pgTable(
  'onboarding_nudges',
  {
    id: pk(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    step: varchar('step', { length: 50 }).notNull(),
    /** 1 | 3 | 7 — which cadence day this send was for. */
    dayOffset: integer('day_offset').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    channel: varchar('channel', { length: 20 }).notNull().default('whatsapp'),
    meta: jsonb('meta').$type<Record<string, unknown>>().default({}),
  },
  (t) => ({
    uq: uniqueIndex('onboarding_nudges_uq').on(t.tenantId, t.step, t.dayOffset),
    tenantIdx: index('onboarding_nudges_tenant_idx').on(t.tenantId),
  }),
);

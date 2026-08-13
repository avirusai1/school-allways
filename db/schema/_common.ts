/**
 * Shared column helpers, enums and conventions.
 *
 * CONVENTIONS — read before adding a table
 * ----------------------------------------
 * 1. Every tenant-owned table MUST have `tenant_id` as the FIRST column after `id`.
 *    There are exactly three exceptions: `tenants`, `plans`, `permissions`.
 *    A table without tenant_id is a cross-tenant leak waiting to happen.
 *
 * 2. Every tenant-owned table gets an RLS policy. See db/sql/002_rls.sql.
 *    The migration will FAIL CI if a tenant table has no policy.
 *
 * 3. Every table that a mobile client syncs MUST spread `...syncable`.
 *    row_version is bumped by a trigger; the client uses it for delta sync.
 *
 * 4. Soft-delete by default (`deleted_at`). Hard deletes only via the
 *    DPDP erasure pipeline, which is audited.
 *
 * 5. Money is stored as INTEGER PAISE. Never float, never numeric-as-rupees.
 *    ₹1,250.50 => 125050. All arithmetic in paise, formatted at the edge.
 */

import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  integer,
  pgEnum,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Column helper groups
// ---------------------------------------------------------------------------

/** Primary key. UUID v7 preferred (time-sortable) — generated app-side. */
export const pk = () => uuid('id').primaryKey().defaultRandom();

/** Created / updated / soft-delete. Present on every table. */
export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
};

/** Who did it. Nullable because system jobs have no actor. */
export const actorstamps = {
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
};

/**
 * Delta-sync support. Spread this into any table the Flutter apps cache locally.
 *
 * `row_version` comes from a single global sequence bumped by trigger
 * `trg_bump_row_version`. A client stores the highest row_version it has seen
 * per entity and asks the server for `WHERE row_version > cursor`, which is
 * an index range scan — cheap enough to run on a 2-core box.
 *
 * See docs/04-sync-architecture.md.
 */
export const syncable = {
  rowVersion: bigint('row_version', { mode: 'bigint' })
    .notNull()
    .default(sql`0`),
};

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

export const genderEnum = pgEnum('gender', ['male', 'female', 'other', 'undisclosed']);

export const boardEnum = pgEnum('board', [
  'cbse',
  'icse',
  'isc',
  'ib',
  'cambridge',
  'state_up',
  'state_mh',
  'state_tn',
  'state_ka',
  'state_wb',
  'state_gj',
  'state_rj',
  'state_other',
  'other',
]);

export const bloodGroupEnum = pgEnum('blood_group', [
  'a_pos', 'a_neg', 'b_pos', 'b_neg',
  'ab_pos', 'ab_neg', 'o_pos', 'o_neg', 'unknown',
]);

/** Social category — needed for RTE, scholarships and UDISE+ reporting. */
export const socialCategoryEnum = pgEnum('social_category', [
  'general', 'obc', 'sc', 'st', 'ews', 'other',
]);

export const attendanceStatusEnum = pgEnum('attendance_status', [
  'present',
  'absent',
  'late',
  'half_day',
  'excused',
  'on_leave',
  'holiday',
  'not_marked',
]);

export const approvalStatusEnum = pgEnum('approval_status', [
  'draft', 'pending', 'approved', 'rejected', 'cancelled',
]);

/**
 * Data sensitivity tier. Drives extra ACL checks and mandatory read-auditing.
 * `restricted` rows (counselling notes, POSH cases, safe reports) are never
 * returned by generic list endpoints — only by their dedicated, audited service.
 */
export const sensitivityEnum = pgEnum('sensitivity', [
  'normal',
  'confidential',
  'restricted',
]);

export const languageEnum = pgEnum('language', [
  'en', 'hi', 'mr', 'ta', 'te', 'bn', 'gu', 'kn', 'ml', 'pa', 'or', 'as',
]);

// ---------------------------------------------------------------------------
// Common typed columns
// ---------------------------------------------------------------------------

/** Indian mobile: stored E.164 without '+', e.g. 919876543210. */
export const phoneCol = (name = 'phone') => varchar(name, { length: 15 });

/** Money in paise. See convention #5. */
export const paise = (name: string) => bigint(name, { mode: 'number' });

/** Percentage 0–10000 = 0.00%–100.00%. Avoids float. */
export const basisPoints = (name: string) => integer(name);

export const isActive = () => boolean('is_active').notNull().default(true);

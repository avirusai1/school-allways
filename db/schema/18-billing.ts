/**
 * Parent-paid student subscriptions, Stay Connected Fee, and the lock that
 * sits in front of the family app.
 *
 * Schools do not pay per student. Parents pay ₹365/student/session (GST
 * inclusive). The school may collect that cash and activate from web-admin;
 * that path is invisible to the parent app (Play policy).
 */

import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { actorstamps, pk, syncable, timestamps } from './_common';
import { academicSessions } from './04-academic';
import { branches, tenants } from './01-tenancy';
import { students } from './05-students';
import { users } from './02-identity';

export const studentSubscriptionStatusEnum = pgEnum('student_subscription_status', [
  'active',
  'expired',
  'refunded',
  'cancelled',
]);

export const studentSubscriptionSourceEnum = pgEnum('student_subscription_source', [
  'google_play',
  'manual_cash',
  'complimentary',
]);

export const stayConnectedFeeStatusEnum = pgEnum('stay_connected_fee_status', [
  'pending',
  'paid',
  'waived',
]);

export const studentSubscriptions = pgTable(
  'student_subscriptions',
  {
    id: pk(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    academicSessionId: uuid('academic_session_id')
      .notNull()
      .references(() => academicSessions.id, { onDelete: 'cascade' }),

    status: studentSubscriptionStatusEnum('status').notNull(),

    totalPaise: integer('total_paise').notNull(),
    basePaise: integer('base_paise').notNull(),
    gstPaise: integer('gst_paise').notNull(),

    source: studentSubscriptionSourceEnum('source').notNull(),

    /** Phase 2 Play Billing — unused until the mobile app exists. */
    playPurchaseToken: text('play_purchase_token'),
    playOrderId: varchar('play_order_id', { length: 100 }),

    activatedByUserId: uuid('activated_by_user_id').references(() => users.id),
    activatedAt: timestamp('activated_at', { withTimezone: true }).notNull(),
    notes: varchar('notes', { length: 300 }),

    billedToSchoolAt: timestamp('billed_to_school_at', { withTimezone: true }),
    platformInvoiceId: uuid('platform_invoice_id'),

    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    studentSessionUq: unique('student_subscriptions_student_session_uq')
      .on(t.studentId, t.academicSessionId)
      .nullsNotDistinct(),
    tenantSessionStatusIdx: index('student_subscriptions_tenant_session_status_idx').on(
      t.tenantId,
      t.academicSessionId,
      t.status,
    ),
    // Partial indexes (unbilled-manual, play token) live in the SQL migration —
    // drizzle cannot express WHERE source = 'manual_cash' AND billed_to_school_at IS NULL.
  }),
);

export const stayConnectedFees = pgTable(
  'stay_connected_fees',
  {
    id: pk(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    academicSessionId: uuid('academic_session_id')
      .notNull()
      .references(() => academicSessions.id, { onDelete: 'cascade' }),

    basePaise: integer('base_paise').notNull(),
    gstPaise: integer('gst_paise').notNull(),
    totalPaise: integer('total_paise').notNull(),

    status: stayConnectedFeeStatusEnum('status').notNull().default('pending'),
    dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    invoiceNumber: varchar('invoice_number', { length: 40 }),
    platformInvoiceId: uuid('platform_invoice_id'),

    ...timestamps,
    ...actorstamps,
  },
  (t) => ({
    tenantSessionUq: unique('stay_connected_fees_tenant_session_uq').on(
      t.tenantId,
      t.academicSessionId,
    ),
    tenantStatusIdx: index('stay_connected_fees_tenant_status_idx').on(t.tenantId, t.status),
  }),
);

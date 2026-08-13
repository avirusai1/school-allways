/**
 * Modules A8 / A12 / E4 — DPDP consent, audit, compliance, sync bookkeeping.
 *
 * LEGAL POSITION, stated plainly because it drives the schema:
 *   - The SCHOOL is the Data Fiduciary. WE are the Data Processor.
 *   - Every student under 18 is a "child" under the DPDP Act. Processing their
 *     data requires VERIFIABLE parental consent — a checkbox is not enough.
 *   - Behavioural tracking and targeted advertising directed at children are
 *     prohibited. We ship no ad SDKs and no behavioural analytics on minors.
 *     Do not add one later "just for product analytics".
 *   - Consent can be withdrawn, and data can be demanded back or erased.
 *
 * This file is what makes those statements enforceable rather than aspirational.
 */

import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  inet,
  integer,
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
import { students } from './05-students';

export const consentStatusEnum = pgEnum('consent_status', [
  'pending', 'granted', 'denied', 'withdrawn', 'expired',
]);

export const consentMethodEnum = pgEnum('consent_method', [
  'app_otp',          // parent confirmed via OTP in the family app
  'physical_form',    // signed paper, scanned and uploaded (APAAR/Aadhaar path)
  'digilocker',
  'in_person',
]);

export const dataRequestTypeEnum = pgEnum('data_request_type', [
  'access', 'export', 'correction', 'erasure', 'withdraw_consent',
]);

// ---------------------------------------------------------------------------
// Consent purposes & ledger
// ---------------------------------------------------------------------------

/** The catalogue of things we might process a child's data FOR. */
export const consentPurposes = pgTable(
  'consent_purposes',
  {
    id: pk(),
    code: varchar('code', { length: 60 }).notNull(),
    name: varchar('name', { length: 150 }).notNull(),
    description: text('description').notNull(),
    /** Plain-language description in Hindi etc. — DPDP notice requirement. */
    translations: jsonb('translations').$type<Record<string, string>>().default({}),

    /** Cannot run the school without it (attendance, fees, report cards). */
    isEssential: boolean('is_essential').notNull().default(false),
    /** Optional: photos in the gallery, bus GPS, biometrics, health records. */
    category: varchar('category', { length: 40 }).notNull().default('operational'),
    /** Days to retain after the purpose ends. Drives the retention job. */
    retentionDays: integer('retention_days'),

    isActive: isActive(),
    ...timestamps,
  },
  (t) => ({ codeUq: uniqueIndex('consent_purposes_code_uq').on(t.code) }),
);

/**
 * The consent ledger. Append-only in spirit: a withdrawal creates a new row
 * rather than mutating the old one, so we can always prove what was consented
 * to at any past moment.
 */
export const consentRecords = pgTable(
  'consent_records',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),

    /** Whose data. */
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    subjectUserId: uuid('subject_user_id').references(() => users.id, { onDelete: 'cascade' }),

    purposeId: uuid('purpose_id').notNull().references(() => consentPurposes.id),

    /** Who gave it — for a minor this MUST be the verified parent/guardian. */
    grantedByUserId: uuid('granted_by_user_id').references(() => users.id),
    grantedByName: varchar('granted_by_name', { length: 150 }),
    relationToSubject: varchar('relation_to_subject', { length: 50 }),

    status: consentStatusEnum('status').notNull().default('pending'),
    method: consentMethodEnum('method').notNull().default('app_otp'),

    /** Evidence of verifiability — the bit that makes it lawful. */
    verificationRef: varchar('verification_ref', { length: 120 }),
    signedDocumentPath: text('signed_document_path'),
    consentIp: inet('consent_ip'),
    consentUserAgent: text('consent_user_agent'),

    /** Exact notice text shown at the time. Immutable evidence. */
    noticeVersion: varchar('notice_version', { length: 20 }),
    noticeTextSnapshot: text('notice_text_snapshot'),

    grantedAt: timestamp('granted_at', { withTimezone: true }),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),

    /** Set when this row supersedes an earlier consent decision. */
    supersedesId: uuid('supersedes_id'),

    ...timestamps,
    ...actorstamps,
  },
  (t) => ({
    studentPurposeIdx: index('consent_student_purpose_idx').on(t.studentId, t.purposeId),
    tenantStatusIdx: index('consent_tenant_status_idx').on(t.tenantId, t.status),
    subjectIdx: index('consent_subject_idx').on(t.subjectUserId),
  }),
);

/** Data-principal requests: access, export, correction, erasure. */
export const dataRequests = pgTable(
  'data_requests',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),

    requestedByUserId: uuid('requested_by_user_id').notNull().references(() => users.id),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),

    type: dataRequestTypeEnum('type').notNull(),
    reason: text('reason'),

    status: varchar('status', { length: 30 }).notNull().default('received'),
    /** Statutory clock. Breaching it is the school's liability and ours. */
    dueBy: date('due_by'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    handledByUserId: uuid('handled_by_user_id').references(() => users.id),

    /** For export requests — the generated archive, short-lived signed URL. */
    exportPath: text('export_path'),
    exportExpiresAt: timestamp('export_expires_at', { withTimezone: true }),

    rejectionReason: text('rejection_reason'),

    ...timestamps,
    ...actorstamps,
  },
  (t) => ({
    tenantStatusIdx: index('data_requests_tenant_status_idx').on(t.tenantId, t.status),
    dueIdx: index('data_requests_due_idx').on(t.dueBy),
  }),
);

/** Retention policy per entity — drives the automated purge job. */
export const retentionPolicies = pgTable(
  'retention_policies',
  {
    id: pk(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),

    entityType: varchar('entity_type', { length: 60 }).notNull(),
    retentionDays: integer('retention_days').notNull(),
    /** 'anonymise' | 'hard_delete' | 'archive' */
    action: varchar('action', { length: 20 }).notNull().default('anonymise'),
    /** Some records must be kept by law even after a student leaves (TC register). */
    legalHoldReason: text('legal_hold_reason'),

    isActive: isActive(),
    ...timestamps,
  },
  (t) => ({
    /**
     * NULLS NOT DISTINCT — tenant_id IS NULL means "platform default policy".
     * Without it every seed run can insert another default for the same entity
     * type (the same failure mode as roles / notification_templates).
     */
    uq: unique('retention_policies_uq')
      .on(t.tenantId, t.entityType)
      .nullsNotDistinct(),
  }),
);

// ---------------------------------------------------------------------------
// A8 — Audit
// ---------------------------------------------------------------------------

/**
 * General audit log: every write to a tenant-scoped table.
 * Append-only. Never updated, never deleted by application code.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: pk(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'cascade' }),

    actorUserId: uuid('actor_user_id').references(() => users.id),
    actorRoleCode: varchar('actor_role_code', { length: 60 }),
    /** Set when a support agent acted as someone — G2 impersonation. */
    impersonatorUserId: uuid('impersonator_user_id').references(() => users.id),

    action: varchar('action', { length: 60 }).notNull(),
    entityType: varchar('entity_type', { length: 60 }).notNull(),
    entityId: uuid('entity_id'),

    /** Field-level diff. Values of sensitive fields are redacted to a marker. */
    changes: jsonb('changes').$type<Record<string, { from: unknown; to: unknown }>>(),

    ip: inet('ip'),
    userAgent: text('user_agent'),
    requestId: varchar('request_id', { length: 60 }),

    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantTimeIdx: index('audit_logs_tenant_time_idx').on(t.tenantId, t.occurredAt),
    entityIdx: index('audit_logs_entity_idx').on(t.entityType, t.entityId),
    actorIdx: index('audit_logs_actor_idx').on(t.actorUserId, t.occurredAt),
  }),
);

/**
 * Separate, stricter log for READS of personal data.
 * Mandatory for anything at `confidential` or `restricted` sensitivity —
 * counselling notes, health records, POSH cases, safe reports, documents.
 * This is what lets a school answer "who looked at my child's file".
 */
export const piiAccessLogs = pgTable(
  'pii_access_logs',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),

    actorUserId: uuid('actor_user_id').notNull().references(() => users.id),
    actorRoleCode: varchar('actor_role_code', { length: 60 }),

    entityType: varchar('entity_type', { length: 60 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    /** The child whose data was read, for the parent-facing access report. */
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),

    sensitivity: sensitivityEnum('sensitivity').notNull(),
    fieldsAccessed: jsonb('fields_accessed').$type<string[]>().default([]),
    /** 'view' | 'list' | 'export' | 'print' | 'download' */
    accessType: varchar('access_type', { length: 20 }).notNull().default('view'),

    /** Set when access came via a record_access_grant rather than a role. */
    grantId: uuid('grant_id'),
    purpose: text('purpose'),

    ip: inet('ip'),
    requestId: varchar('request_id', { length: 60 }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantTimeIdx: index('pii_logs_tenant_time_idx').on(t.tenantId, t.occurredAt),
    studentIdx: index('pii_logs_student_idx').on(t.studentId, t.occurredAt),
    actorIdx: index('pii_logs_actor_idx').on(t.actorUserId, t.occurredAt),
  }),
);

// ---------------------------------------------------------------------------
// A10 — Sync bookkeeping (see docs/04-sync-architecture.md)
// ---------------------------------------------------------------------------

/**
 * Server-side record of how far each device has synced, per entity.
 * Lets us answer "is this device stale?" without trusting the client, and
 * powers the targeted sync nudge instead of a broadcast.
 */
export const syncCursors = pgTable(
  'sync_cursors',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    deviceId: varchar('device_id', { length: 100 }).notNull(),

    entityType: varchar('entity_type', { length: 60 }).notNull(),
    /** Highest row_version this device has confirmed receiving. */
    lastRowVersion: bigint('last_row_version', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),

    /** Server-computed: rows waiting. Drives the "N updates" badge. */
    pendingCount: integer('pending_count').notNull().default(0),

    ...timestamps,
  },
  (t) => ({
    uq: uniqueIndex('sync_cursors_uq').on(t.userId, t.deviceId, t.entityType),
    staleIdx: index('sync_cursors_stale_idx').on(t.tenantId, t.entityType, t.lastRowVersion),
  }),
);

/**
 * Tombstones. A deleted row cannot be delta-synced (it's gone), so deletions
 * are recorded here with a row_version the client can pick up.
 * Purged after 90 days — a device offline longer than that does a full resync.
 */
export const syncTombstones = pgTable(
  'sync_tombstones',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    entityType: varchar('entity_type', { length: 60 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    rowVersion: bigint('row_version', { mode: 'bigint' }).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    lookupIdx: index('sync_tombstones_lookup_idx').on(t.tenantId, t.entityType, t.rowVersion),
  }),
);

/**
 * Idempotency ledger for offline mutation replay.
 * The client generates a UUID per mutation and retries safely; we return the
 * original response instead of double-applying.
 */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),

    clientMutationId: uuid('client_mutation_id').notNull(),
    endpoint: varchar('endpoint', { length: 150 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }),

    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body').$type<Record<string, unknown>>(),

    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => ({
    uq: uniqueIndex('idempotency_keys_uq').on(t.clientMutationId),
    expiryIdx: index('idempotency_keys_expiry_idx').on(t.expiresAt),
  }),
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const consentRecordsRelations = relations(consentRecords, ({ one }) => ({
  purpose: one(consentPurposes, {
    fields: [consentRecords.purposeId],
    references: [consentPurposes.id],
  }),
  student: one(students, {
    fields: [consentRecords.studentId],
    references: [students.id],
  }),
}));

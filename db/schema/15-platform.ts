/**
 * Module G — Platform Console ("All Ways Control"). OUR admin, not a school's.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ THE PRIVACY RULE THAT SHAPES THIS ENTIRE FILE                            │
 * │                                                                          │
 * │ The platform console reads ONLY from aggregate rollup tables. It never   │
 * │ queries students, guardians, marks, fees or messages directly.           │
 * │                                                                          │
 * │ Not "shouldn't" — CANNOT, structurally: the console's API surface is     │
 * │ built exclusively on the tables below, and none of them contain a name,  │
 * │ a phone number, a mark, or any other personal datum. The worst possible  │
 * │ breach of the control plane leaks COUNTS.                                │
 * │                                                                          │
 * │ Reading a school's actual records requires an explicit, time-boxed,      │
 * │ school-visible support session (platform_support_sessions), which is a   │
 * │ separate and loudly audited code path.                                   │
 * │                                                                          │
 * │ This matters commercially, not just ethically: "we cannot see your       │
 * │ students' data" is a sentence that closes deals with principals who have │
 * │ been burned before.                                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * These tables are deliberately NOT tenant-scoped in the RLS sense — they are
 * the control plane. Access is gated by the platform role plus the
 * `app.platform_admin` setting, and every read is audited.
 */

import { relations } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { actorstamps, isActive, paise, pk, timestamps } from './_common';
import { tenants } from './01-tenancy';
import { users } from './02-identity';

export const flagKindEnum = pgEnum('flag_kind', [
  'boolean',
  'percentage', // staged rollout
  'allowlist',
  'config', // arbitrary JSON value
]);

export const healthBandEnum = pgEnum('health_band', [
  'not_started',
  'onboarding',
  'activated',
  'healthy',
  'at_risk',
  'churning',
  'dormant',
]);

// ---------------------------------------------------------------------------
// Feature flags — global definitions + per-school overrides
// ---------------------------------------------------------------------------

/**
 * The catalogue of things we can switch on or off. Global, not tenant-scoped.
 *
 * Two distinct uses, deliberately unified:
 *   - PRODUCT flags: staged rollout of a new module to 10% of schools.
 *   - COMMERCIAL flags: a school on Free asking to trial Transport for a month.
 * Both are "is this on for this school right now", so one mechanism serves both.
 */
export const platformFeatureFlags = pgTable(
  'platform_feature_flags',
  {
    id: pk(),
    key: varchar('key', { length: 80 }).notNull(),
    name: varchar('name', { length: 150 }).notNull(),
    description: text('description'),

    /** Module code this flag gates, e.g. 'D6'. Null for non-module flags. */
    moduleCode: varchar('module_code', { length: 10 }),
    kind: flagKindEnum('kind').notNull().default('boolean'),

    /** Applied when a tenant has no override row. */
    defaultValue: jsonb('default_value').$type<unknown>().notNull().default(false),
    /** For staged rollout: 0-100. Bucketed by a hash of tenant id, so a school
     *  never flips back and forth between requests. */
    rolloutPercentage: smallint('rollout_percentage').default(0),

    /**
     * Kill switch. When TRUE the flag is forced OFF everywhere regardless of
     * overrides — the thing you reach for at 2am when a module is melting the
     * database. Deploying a fix takes minutes; flipping this takes seconds.
     */
    isKillSwitched: boolean('is_kill_switched').notNull().default(false),

    isActive: isActive(),
    ...timestamps,
    ...actorstamps,
  },
  (t) => ({
    keyUq: uniqueIndex('platform_flags_key_uq').on(t.key),
    moduleIdx: index('platform_flags_module_idx').on(t.moduleCode),
  }),
);

export const tenantFeatureOverrides = pgTable(
  'tenant_feature_overrides',
  {
    id: pk(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    flagId: uuid('flag_id')
      .notNull()
      .references(() => platformFeatureFlags.id, { onDelete: 'cascade' }),

    value: jsonb('value').$type<unknown>().notNull(),

    /** Time-boxed trials expire on their own — no cleanup job needed. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    reason: text('reason'),

    /** Who flipped it. Always a platform user; school admins use tenant_settings. */
    setByUserId: uuid('set_by_user_id').references(() => users.id),

    ...timestamps,
  },
  (t) => ({
    uq: uniqueIndex('tenant_flag_overrides_uq').on(t.tenantId, t.flagId),
    tenantIdx: index('tenant_flag_overrides_tenant_idx').on(t.tenantId),
    expiryIdx: index('tenant_flag_overrides_expiry_idx').on(t.expiresAt),
  }),
);

// ---------------------------------------------------------------------------
// Aggregate metrics — THE ONLY THING THE CONSOLE READS
// ---------------------------------------------------------------------------

/**
 * One row per tenant per day. Written by a nightly rollup job.
 *
 * EVERY COLUMN IS A COUNT, A SUM OR A RATIO. There is no name, no phone
 * number, no identifier of any person. That is a hard invariant — if you are
 * ever tempted to add `top_defaulter_name` here, don't.
 *
 * Why a rollup table rather than querying live:
 *   1. Privacy, per the header.
 *   2. Cost. `SELECT count(*) FROM students` across 100 tenants on every
 *      dashboard load would flatten a 2-core box. This is one indexed read.
 *   3. History. Trends need yesterday's numbers, and live queries can't
 *      reconstruct them.
 */
export const tenantMetricsDaily = pgTable(
  'tenant_metrics_daily',
  {
    id: pk(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),

    // --- Scale ---
    branchCount: integer('branch_count').notNull().default(0),
    studentCount: integer('student_count').notNull().default(0),
    staffCount: integer('staff_count').notNull().default(0),
    guardianCount: integer('guardian_count').notNull().default(0),
    activeClassCount: integer('active_class_count').notNull().default(0),

    // --- Adoption: the numbers that predict churn ---
    /** Distinct users who opened either app today. */
    dauStaff: integer('dau_staff').notNull().default(0),
    dauParents: integer('dau_parents').notNull().default(0),
    mauStaff: integer('mau_staff').notNull().default(0),
    mauParents: integer('mau_parents').notNull().default(0),
    /** Of parents invited, how many have logged in at least once. Basis points. */
    parentActivationBp: integer('parent_activation_bp').notNull().default(0),

    // --- Usage by module ---
    /** THE leading indicator. A school that stops marking attendance has churned
     *  and simply hasn't told us yet. */
    attendanceRegistersMarked: integer('attendance_registers_marked').notNull().default(0),
    attendanceRegistersExpected: integer('attendance_registers_expected').notNull().default(0),
    homeworkPosted: integer('homework_posted').notNull().default(0),
    announcementsSent: integer('announcements_sent').notNull().default(0),
    messagesSent: integer('messages_sent').notNull().default(0),
    marksEntered: integer('marks_entered').notNull().default(0),
    reportCardsPublished: integer('report_cards_published').notNull().default(0),
    booksOpened: integer('books_opened').notNull().default(0),
    tripsRun: integer('trips_run').notNull().default(0),

    // --- Commercial (aggregate only; never per-student) ---
    invoicesRaised: integer('invoices_raised').notNull().default(0),
    /** Total, in paise. A sum, not a ledger. */
    feesCollectedPaise: paise('fees_collected_paise').notNull().default(0),
    feesOutstandingPaise: paise('fees_outstanding_paise').notNull().default(0),
    onlinePaymentCount: integer('online_payment_count').notNull().default(0),

    // --- OUR cost to serve this school. Drives pricing decisions. ---
    smsSent: integer('sms_sent').notNull().default(0),
    smsCostPaise: paise('sms_cost_paise').notNull().default(0),
    whatsappSent: integer('whatsapp_sent').notNull().default(0),
    pushSent: integer('push_sent').notNull().default(0),
    storageBytes: bigint('storage_bytes', { mode: 'number' }).notNull().default(0),
    apiRequests: integer('api_requests').notNull().default(0),
    /** Bytes served. The 10 Mbps link is the real constraint, so watch this. */
    egressBytes: bigint('egress_bytes', { mode: 'number' }).notNull().default(0),

    // --- Compliance posture (counts, not records) ---
    apaarGenerated: integer('apaar_generated').notNull().default(0),
    apaarPending: integer('apaar_pending').notNull().default(0),
    consentPending: integer('consent_pending').notNull().default(0),

    computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow(),
    ...timestamps,
  },
  (t) => ({
    uq: uniqueIndex('tenant_metrics_daily_uq').on(t.tenantId, t.day),
    dayIdx: index('tenant_metrics_daily_day_idx').on(t.day),
    /** Covering index for the console's "all schools, latest day" grid. */
    tenantDayIdx: index('tenant_metrics_daily_tenant_day_idx').on(t.tenantId, t.day),
  }),
);

/**
 * Current health, recomputed nightly. One row per tenant.
 *
 * Exists so the console's default view is a single sorted scan of ~100 rows
 * rather than a window function over a year of daily metrics.
 */
export const tenantHealth = pgTable(
  'tenant_health',
  {
    id: pk(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    band: healthBandEnum('band').notNull().default('not_started'),
    /** 0-100. Weighted blend of the components below. */
    score: smallint('score').notNull().default(0),

    /** Did they finish the wizard and take a first attendance? */
    activationScore: smallint('activation_score').notNull().default(0),
    /** Are staff and parents actually using it week to week? */
    engagementScore: smallint('engagement_score').notNull().default(0),
    /** Breadth: how many modules are in real use? */
    adoptionScore: smallint('adoption_score').notNull().default(0),

    daysSinceLastAttendance: integer('days_since_last_attendance'),
    daysSinceAnyActivity: integer('days_since_any_activity'),

    /** Human-readable reasons, for the CSM view: ["no attendance for 9 days"] */
    riskReasons: jsonb('risk_reasons').$type<string[]>().notNull().default([]),

    /** Suppress nudges while someone is actively working the account. */
    snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
    ownerUserId: uuid('owner_user_id').references(() => users.id),

    computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow(),
    ...timestamps,
  },
  (t) => ({
    tenantUq: uniqueIndex('tenant_health_tenant_uq').on(t.tenantId),
    bandIdx: index('tenant_health_band_idx').on(t.band, t.score),
  }),
);

// ---------------------------------------------------------------------------
// Self-serve onboarding funnel (module G3)
// ---------------------------------------------------------------------------

/**
 * Every step of the signup wizard, with timings.
 *
 * THIS IS THE GROWTH LOOP, not analytics vanity. If 40% of schools abandon at
 * "import students", that single number tells you what to build next — and
 * you cannot learn it from a completion rate alone.
 *
 * No PII: we record which step and how long, never what was typed.
 */
export const onboardingEvents = pgTable(
  'onboarding_events',
  {
    id: pk(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    /** 'school_profile' | 'session' | 'classes' | 'subjects' | 'import_staff' |
     *  'import_students' | 'invite_staff' | 'invite_parents' | 'first_attendance' */
    step: varchar('step', { length: 50 }).notNull(),
    /** 'started' | 'completed' | 'skipped' | 'failed' | 'abandoned' */
    action: varchar('action', { length: 20 }).notNull(),

    /** Time from step start to this event. The abandonment signal. */
    durationSeconds: integer('duration_seconds'),
    /** For imports: rows attempted / succeeded / failed. Counts only. */
    itemCount: integer('item_count'),
    errorCount: integer('error_count'),
    /** Human-readable failure class, e.g. 'date_format_invalid'. Never row data. */
    errorClass: varchar('error_class', { length: 80 }),

    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index('onboarding_events_tenant_idx').on(t.tenantId, t.occurredAt),
    stepIdx: index('onboarding_events_step_idx').on(t.step, t.action),
  }),
);

// ---------------------------------------------------------------------------
// Support sessions — the ONLY way to see real school data
// ---------------------------------------------------------------------------

/**
 * A time-boxed, audited grant allowing a support agent to act inside a school.
 *
 * DESIGN CHOICES THAT ARE NOT NEGOTIABLE:
 *   - Always time-boxed. `expires_at` is NOT NULL. There is no permanent
 *     backdoor, so there is nothing to forget to revoke.
 *   - Always attributed. The impersonated request carries `imp` in the JWT and
 *     every audit row records both identities.
 *   - Always visible to the school. `school_notified_at` is set on start, and
 *     the session appears in the school's own audit view. A support session the
 *     customer cannot see is a backdoor with better branding.
 *   - Reason is mandatory and free-text. "Debugging" is not a reason; a ticket
 *     number is.
 *   - `requires_school_approval` lets a school demand explicit consent per
 *     session. Offer it on higher tiers; it is a genuine trust differentiator.
 */
export const platformSupportSessions = pgTable(
  'platform_support_sessions',
  {
    id: pk(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    agentUserId: uuid('agent_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** Whose account is being acted as. Null = read-only tenant access. */
    impersonatedUserId: uuid('impersonated_user_id').references(() => users.id),

    reason: text('reason').notNull(),
    ticketRef: varchar('ticket_ref', { length: 60 }),

    /** 'read_only' | 'read_write' — write access needs a supervisor. */
    accessLevel: varchar('access_level', { length: 20 }).notNull().default('read_only'),
    approvedBySupervisorId: uuid('approved_by_supervisor_id').references(() => users.id),

    requiresSchoolApproval: boolean('requires_school_approval').notNull().default(false),
    schoolApprovedByUserId: uuid('school_approved_by_user_id').references(() => users.id),
    schoolApprovedAt: timestamp('school_approved_at', { withTimezone: true }),
    schoolNotifiedAt: timestamp('school_notified_at', { withTimezone: true }),

    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    /** NOT NULL by design — see the header. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),

    /** Rolling count, for the "what did they actually do" summary. */
    actionCount: integer('action_count').notNull().default(0),

    ...timestamps,
  },
  (t) => ({
    tenantIdx: index('support_sessions_tenant_idx').on(t.tenantId, t.startedAt),
    agentIdx: index('support_sessions_agent_idx').on(t.agentUserId, t.startedAt),
    activeIdx: index('support_sessions_active_idx').on(t.expiresAt, t.endedAt),
  }),
);

// ---------------------------------------------------------------------------
// Platform → school announcements, and growth
// ---------------------------------------------------------------------------

export const platformAnnouncements = pgTable(
  'platform_announcements',
  {
    id: pk(),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body').notNull(),
    /** 'release' | 'maintenance' | 'incident' | 'compliance' | 'marketing' */
    kind: varchar('kind', { length: 30 }).notNull().default('release'),

    /** Target by plan, health band or explicit list. Empty = everyone. */
    targetPlanCodes: jsonb('target_plan_codes').$type<string[]>().default([]),
    targetHealthBands: jsonb('target_health_bands').$type<string[]>().default([]),
    targetTenantIds: jsonb('target_tenant_ids').$type<string[]>().default([]),

    showFrom: timestamp('show_from', { withTimezone: true }),
    showUntil: timestamp('show_until', { withTimezone: true }),
    /** Blocks the UI until acknowledged. Reserve for compliance deadlines. */
    isBlocking: boolean('is_blocking').notNull().default(false),

    ctaLabel: varchar('cta_label', { length: 60 }),
    ctaUrl: text('cta_url'),

    isActive: isActive(),
    ...timestamps,
    ...actorstamps,
  },
  (t) => ({ windowIdx: index('platform_announcements_window_idx').on(t.showFrom, t.showUntil) }),
);

/**
 * Referrals. A principal recommending you to another principal is the single
 * highest-converting channel in Indian K-12 — they all know each other through
 * board associations and cluster meetings. Make it mechanical, not hopeful.
 */
export const referrals = pgTable(
  'referrals',
  {
    id: pk(),
    /**
     * Owner of the row = the referring school. Present so this table gets Row
     * Level Security like everything else: a school views its own referrals
     * from inside the family/admin app (module 17a), which makes this table
     * tenant-REACHABLE, not purely control-plane. Without tenant_id it would
     * have no RLS policy and one school could read another's referral list.
     * Always equals referrerTenantId; kept separate so the FK semantics stay
     * readable.
     */
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    referrerTenantId: uuid('referrer_tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    referrerUserId: uuid('referrer_user_id').references(() => users.id),

    code: varchar('code', { length: 20 }).notNull(),
    /** Set when the referred school signs up. */
    referredTenantId: uuid('referred_tenant_id').references(() => tenants.id, {
      onDelete: 'set null',
    }),

    /** Contact details of the invited school — NOT student data. */
    invitedSchoolName: varchar('invited_school_name', { length: 200 }),
    invitedContactPhone: varchar('invited_contact_phone', { length: 15 }),

    /** 'sent' | 'signed_up' | 'activated' | 'converted' | 'rewarded' | 'expired' */
    status: varchar('status', { length: 20 }).notNull().default('sent'),
    signedUpAt: timestamp('signed_up_at', { withTimezone: true }),
    /** Reward only when the referred school ACTIVATES, not when it signs up.
     *  Rewarding signups buys you fake schools. */
    activatedAt: timestamp('activated_at', { withTimezone: true }),

    rewardMonths: smallint('reward_months').default(0),
    rewardGrantedAt: timestamp('reward_granted_at', { withTimezone: true }),

    ...timestamps,
  },
  (t) => ({
    codeUq: uniqueIndex('referrals_code_uq').on(t.code),
    referrerIdx: index('referrals_referrer_idx').on(t.referrerTenantId),
    statusIdx: index('referrals_status_idx').on(t.status),
  }),
);

/** Resellers / channel partners — how you reach hundreds without a sales team. */
export const partners = pgTable(
  'partners',
  {
    id: pk(),
    name: varchar('name', { length: 200 }).notNull(),
    contactName: varchar('contact_name', { length: 150 }),
    contactPhone: varchar('contact_phone', { length: 15 }),
    contactEmail: varchar('contact_email', { length: 254 }),
    city: varchar('city', { length: 100 }),
    state: varchar('state', { length: 100 }),

    /** Basis points of subscription revenue. 2000 = 20%. */
    commissionBp: integer('commission_bp').notNull().default(0),
    referralCode: varchar('referral_code', { length: 20 }).notNull(),

    /**
     * Partners get a scoped console listing THEIR schools' health only —
     * same aggregate-only rule as our own console. A reseller must not be able
     * to browse a school's students either.
     */
    canViewSchoolMetrics: boolean('can_view_school_metrics').notNull().default(true),

    isActive: isActive(),
    ...timestamps,
    ...actorstamps,
  },
  (t) => ({ codeUq: uniqueIndex('partners_code_uq').on(t.referralCode) }),
);

export const platformInvoiceStatusEnum = pgEnum('platform_invoice_status', [
  'issued',
  'void',
]);

export const platformInvoicePdfStatusEnum = pgEnum('platform_invoice_pdf_status', [
  'pending',
  'ready',
  'failed',
]);

/**
 * B2B invoices only: manual parent activations billed back to the school,
 * and the Stay Connected Fee. Play purchases are invoiced by Google, not us.
 *
 * Counts and rupee totals. Never a student name.
 */
export const platformInvoices = pgTable(
  'platform_invoices',
  {
    id: pk(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    invoiceNumber: varchar('invoice_number', { length: 40 }).notNull(),
    financialYear: varchar('financial_year', { length: 9 }).notNull(),
    kind: varchar('kind', { length: 40 }).notNull(),
    lineItems: jsonb('line_items')
      .$type<Array<{ description: string; quantity: number; unitPaise: number; amountPaise: number }>>()
      .notNull(),
    basePaise: integer('base_paise').notNull(),
    cgstPaise: integer('cgst_paise').notNull().default(0),
    sgstPaise: integer('sgst_paise').notNull().default(0),
    igstPaise: integer('igst_paise').notNull().default(0),
    totalPaise: integer('total_paise').notNull(),
    sacCode: varchar('sac_code', { length: 10 }).notNull(),
    placeOfSupply: varchar('place_of_supply', { length: 100 }).notNull(),
    pdfPath: text('pdf_path'),
    pdfStatus: platformInvoicePdfStatusEnum('pdf_status').notNull().default('pending'),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull(),
    status: platformInvoiceStatusEnum('status').notNull().default('issued'),
    ...timestamps,
    ...actorstamps,
  },
  (t) => ({
    numberUq: uniqueIndex('platform_invoices_number_uq').on(t.invoiceNumber),
    tenantIdx: index('platform_invoices_tenant_idx').on(t.tenantId, t.issuedAt),
  }),
);

/** Collision-safe sequential numbering per Indian financial year. */
export const platformInvoiceCounters = pgTable(
  'platform_invoice_counters',
  {
    financialYear: varchar('financial_year', { length: 9 }).primaryKey(),
    lastNumber: integer('last_number').notNull(),
  },
);

export const partnerTenants = pgTable(
  'partner_tenants',
  {
    id: pk(),
    partnerId: uuid('partner_id').notNull().references(() => partners.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    attributedAt: timestamp('attributed_at', { withTimezone: true }).defaultNow(),
    commissionBp: integer('commission_bp'),
    ...timestamps,
  },
  (t) => ({ uq: uniqueIndex('partner_tenants_uq').on(t.partnerId, t.tenantId) }),
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const platformFeatureFlagsRelations = relations(platformFeatureFlags, ({ many }) => ({
  overrides: many(tenantFeatureOverrides),
}));

export const tenantFeatureOverridesRelations = relations(tenantFeatureOverrides, ({ one }) => ({
  flag: one(platformFeatureFlags, {
    fields: [tenantFeatureOverrides.flagId],
    references: [platformFeatureFlags.id],
  }),
  tenant: one(tenants, {
    fields: [tenantFeatureOverrides.tenantId],
    references: [tenants.id],
  }),
}));

export const tenantHealthRelations = relations(tenantHealth, ({ one }) => ({
  tenant: one(tenants, { fields: [tenantHealth.tenantId], references: [tenants.id] }),
}));

export const partnersRelations = relations(partners, ({ many }) => ({
  tenants: many(partnerTenants),
}));

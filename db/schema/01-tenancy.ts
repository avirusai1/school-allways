/**
 * Module A1 / A11 / A13 — Tenancy, branches, plans, subscriptions, settings.
 *
 * Tenant model: ONE TENANT = ONE SCHOOL GROUP (trust / society / owner).
 * Branches live under a tenant. A single standalone school is simply a tenant
 * with one branch — no special-casing anywhere in the codebase.
 *
 * Why not tenant-per-school? Because a chain owner must see all their schools
 * in one login, and moving a school between tenants later is a migration
 * nightmare. Branch-level RLS scoping handles "this principal only sees
 * branch X".
 */

import { relations } from 'drizzle-orm';
import {
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
  integer,
  boolean,
} from 'drizzle-orm/pg-core';
import {
  actorstamps,
  boardEnum,
  isActive,
  languageEnum,
  paise,
  phoneCol,
  pk,
  syncable,
  timestamps,
} from './_common';

export const tenantStatusEnum = pgEnum('tenant_status', [
  'onboarding',   // signed up, wizard incomplete
  'trial',
  'active',
  'past_due',
  'suspended',    // non-payment or ToS
  'churned',
]);

export const planTierEnum = pgEnum('plan_tier', ['free', 'standard', 'pro', 'pilot']);

// ---------------------------------------------------------------------------
// Tenants (school groups)
// ---------------------------------------------------------------------------

export const tenants = pgTable(
  'tenants',
  {
    id: pk(),
    /** URL-safe identifier: dps-rohini => dps-rohini.school.techallways.com */
    slug: varchar('slug', { length: 63 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    legalName: varchar('legal_name', { length: 250 }),

    status: tenantStatusEnum('status').notNull().default('onboarding'),
    planTier: planTierEnum('plan_tier').notNull().default('free'),

    /** Primary contact — the person who signed up on the landing page. */
    ownerName: varchar('owner_name', { length: 150 }),
    ownerPhone: phoneCol('owner_phone'),
    ownerEmail: varchar('owner_email', { length: 254 }),

    defaultLanguage: languageEnum('default_language').notNull().default('en'),
    timezone: varchar('timezone', { length: 64 }).notNull().default('Asia/Kolkata'),
    currency: varchar('currency', { length: 3 }).notNull().default('INR'),

    /** Self-serve onboarding progress. Drives the wizard + activation analytics. */
    onboardingStep: varchar('onboarding_step', { length: 50 }).default('school_profile'),
    onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
    /** Set when the school takes its FIRST attendance — the activation event. */
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    /** True while sample data is loaded; wiped on first real import. */
    hasSampleData: boolean('has_sample_data').notNull().default(true),

    /** Branding — A15 white-label */
    logoPath: text('logo_path'),
    primaryColor: varchar('primary_color', { length: 9 }),
    customDomain: varchar('custom_domain', { length: 253 }),

    isActive: isActive(),
    ...timestamps,
    ...actorstamps,
  },
  (t) => ({
    slugUq: uniqueIndex('tenants_slug_uq').on(t.slug),
    customDomainUq: uniqueIndex('tenants_custom_domain_uq').on(t.customDomain),
    statusIdx: index('tenants_status_idx').on(t.status),
  }),
);

// ---------------------------------------------------------------------------
// Branches (individual schools)
// ---------------------------------------------------------------------------

export const branches = pgTable(
  'branches',
  {
    id: pk(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    code: varchar('code', { length: 30 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    board: boardEnum('board').notNull().default('cbse'),

    // --- Statutory identifiers (E4 Compliance Centre) ---
    /** 11-digit UDISE+ school code. */
    udiseCode: varchar('udise_code', { length: 11 }),
    /** CBSE/ICSE affiliation number. */
    affiliationNo: varchar('affiliation_no', { length: 30 }),
    affiliationValidTill: timestamp('affiliation_valid_till', { withTimezone: true }),

    // --- Address ---
    addressLine1: varchar('address_line1', { length: 200 }),
    addressLine2: varchar('address_line2', { length: 200 }),
    city: varchar('city', { length: 100 }),
    district: varchar('district', { length: 100 }),
    state: varchar('state', { length: 100 }),
    pincode: varchar('pincode', { length: 6 }),

    phone: phoneCol('phone'),
    email: varchar('email', { length: 254 }),
    website: varchar('website', { length: 253 }),

    /** Geofence centre — used by staff geo-attendance and bus arrival alerts. */
    latitude: varchar('latitude', { length: 20 }),
    longitude: varchar('longitude', { length: 20 }),
    geofenceRadiusM: integer('geofence_radius_m').default(200),

    isActive: isActive(),
    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    tenantCodeUq: uniqueIndex('branches_tenant_code_uq').on(t.tenantId, t.code),
    tenantIdx: index('branches_tenant_idx').on(t.tenantId),
    udiseIdx: index('branches_udise_idx').on(t.udiseCode),
  }),
);

// ---------------------------------------------------------------------------
// Plans & subscriptions (OUR revenue — module A11)
// ---------------------------------------------------------------------------

/** Global, not tenant-scoped. */
export const plans = pgTable(
  'plans',
  {
    id: pk(),
    code: varchar('code', { length: 40 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    tier: planTierEnum('tier').notNull(),
    /** Paise per student per year. 0 for free/pilot. */
    pricePerStudentYear: paise('price_per_student_year').notNull().default(0),
    maxStudents: integer('max_students'),
    maxBranches: integer('max_branches').default(1),
    /** Module codes unlocked, e.g. ["B3","B8","C1","C2"]. Drives A13 gating. */
    includedModules: jsonb('included_modules').$type<string[]>().notNull().default([]),
    isPublic: boolean('is_public').notNull().default(true),
    isActive: isActive(),
    ...timestamps,
  },
  (t) => ({ codeUq: uniqueIndex('plans_code_uq').on(t.code) }),
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: pk(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id').notNull().references(() => plans.id),

    startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),

    /** Billable headcount snapshot, recomputed nightly. */
    billedStudentCount: integer('billed_student_count').notNull().default(0),
    amountPaise: paise('amount_paise').notNull().default(0),

    status: tenantStatusEnum('status').notNull().default('trial'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),

    ...timestamps,
    ...actorstamps,
  },
  (t) => ({
    tenantIdx: index('subscriptions_tenant_idx').on(t.tenantId),
  }),
);

// ---------------------------------------------------------------------------
// Per-tenant settings & feature flags (A13)
// ---------------------------------------------------------------------------

/**
 * Key/value settings bag. Deliberately schemaless — 53 modules will each want
 * their own knobs and we are not adding a column per knob.
 *
 * Known keys include:
 *   safe_reporting.enabled            -> bool   (your decision #3)
 *   safe_reporting.route_to           -> 'counsellor' | 'principal' | 'both'
 *   guardian.secondary_can_pay        -> bool   (your decision #4, default TRUE)
 *   teacher.can_view_fee_status       -> bool   (your decision #2, default TRUE)
 *   comms.quiet_hours_start/end       -> 'HH:mm'
 *   comms.sms_fallback_enabled        -> bool
 *   attendance.mode                   -> 'daily' | 'period'
 *   books.allow_upload                -> bool
 *   books.max_file_mb                 -> int
 */
export const tenantSettings = pgTable(
  'tenant_settings',
  {
    id: pk(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** Null = applies to whole tenant; set = branch override. */
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'cascade' }),

    key: varchar('key', { length: 100 }).notNull(),
    value: jsonb('value').notNull(),

    ...timestamps,
    ...actorstamps,
  },
  (t) => ({
    /**
     * NULLS NOT DISTINCT — branch_id IS NULL means "tenant-wide setting".
     * Without it, two rows for the same (tenant, key) with a NULL branch both
     * survive, and which value a session reads becomes a race.
     */
    scopeKeyUq: unique('tenant_settings_scope_key_uq')
      .on(t.tenantId, t.branchId, t.key)
      .nullsNotDistinct(),
    tenantIdx: index('tenant_settings_tenant_idx').on(t.tenantId),
  }),
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const tenantsRelations = relations(tenants, ({ many }) => ({
  branches: many(branches),
  subscriptions: many(subscriptions),
  settings: many(tenantSettings),
}));

export const branchesRelations = relations(branches, ({ one }) => ({
  tenant: one(tenants, { fields: [branches.tenantId], references: [tenants.id] }),
}));

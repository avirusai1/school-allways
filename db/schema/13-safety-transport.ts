/**
 * Modules D1–D8 — Gate, visitor, student handover, transport.
 *
 * THE SAFETY LAYER IS THE EMOTIONAL PARENT BUY, and it is now also a
 * regulatory requirement: CBSE pushes GPS + CCTV in school buses, and states
 * including Maharashtra and UP mandate GPS, CCTV, panic buttons, seat belts,
 * digital boarding records and parent-visible live tracking.
 *
 * GPS PINGS DO NOT LIVE HERE. Writing thousands of location rows/minute into
 * the OLTP database would destroy a 2-core box. `vehicle_pings` is a separate,
 * append-only, aggressively-retained table (7 days) and the live position is
 * held in Redis. See docs/03-tech-stack-and-infra.md.
 */

import { relations } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  actorstamps,
  isActive,
  paise,
  phoneCol,
  pk,
  sensitivityEnum,
  syncable,
  timestamps,
} from './_common';
import { branches, tenants } from './01-tenancy';
import { users } from './02-identity';
import { academicSessions } from './04-academic';
import { guardians, students } from './05-students';
import { staff } from './06-staff';

export const visitorPurposeEnum = pgEnum('visitor_purpose', [
  'parent_meeting', 'admission_enquiry', 'vendor', 'contractor',
  'official', 'interview', 'delivery', 'alumni', 'other',
]);

export const pickupMethodEnum = pgEnum('pickup_method', [
  'parent', 'authorised_person', 'school_bus', 'self', 'private_transport', 'staff_ward',
]);

export const tripDirectionEnum = pgEnum('trip_direction', ['pickup', 'drop']);

export const boardingEventEnum = pgEnum('boarding_event', [
  'boarded', 'alighted', 'no_show', 'missed_stop',
]);

// ---------------------------------------------------------------------------
// D1 — Visitor management
// ---------------------------------------------------------------------------

export const visitors = pgTable(
  'visitors',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),

    fullName: varchar('full_name', { length: 150 }).notNull(),
    phone: phoneCol('phone'),
    photoPath: text('photo_path'),
    /** ID type + last 4 only. We do not store full ID numbers at the gate. */
    idType: varchar('id_type', { length: 30 }),
    idLast4: varchar('id_last4', { length: 4 }),
    organisation: varchar('organisation', { length: 150 }),

    purpose: visitorPurposeEnum('purpose').notNull().default('other'),
    /** Who they came to meet. */
    hostStaffId: uuid('host_staff_id').references(() => staff.id),
    /** Or which child they came for. */
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'set null' }),

    badgeNo: varchar('badge_no', { length: 30 }),
    /** Pre-registered visits get a QR — skips the queue at the gate. */
    preRegisteredCode: varchar('pre_registered_code', { length: 20 }),
    expectedAt: timestamp('expected_at', { withTimezone: true }),

    checkInAt: timestamp('check_in_at', { withTimezone: true }),
    checkOutAt: timestamp('check_out_at', { withTimezone: true }),

    /** Host approval before entry — the thing a paper register cannot do. */
    isApproved: boolean('is_approved').notNull().default(false),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),

    /** Blacklist flag — checked automatically on phone match. */
    isBlacklisted: boolean('is_blacklisted').notNull().default(false),

    recordedByUserId: uuid('recorded_by_user_id').references(() => users.id),
    remarks: text('remarks'),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    branchDateIdx: index('visitors_branch_date_idx').on(t.branchId, t.checkInAt),
    phoneIdx: index('visitors_phone_idx').on(t.tenantId, t.phone),
    codeIdx: index('visitors_code_idx').on(t.preRegisteredCode),
    /** "Who is currently inside the school" — the guard's live list. */
    insideIdx: index('visitors_inside_idx').on(t.branchId, t.checkOutAt),
  }),
);

// ---------------------------------------------------------------------------
// D2 — Authorised pickup. THE differentiator.
// ---------------------------------------------------------------------------

/**
 * Who is allowed to collect this child. Managed by the parent from the family
 * app (F10). Photo is mandatory — the guard matches a face, not a name.
 */
export const authorisedPickups = pgTable(
  'authorised_pickups',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),

    /** Either an existing guardian, or an ad-hoc person. */
    guardianId: uuid('guardian_id').references(() => guardians.id, { onDelete: 'cascade' }),
    fullName: varchar('full_name', { length: 150 }).notNull(),
    relation: varchar('relation', { length: 50 }),
    phone: phoneCol('phone'),
    photoPath: text('photo_path').notNull(),
    idType: varchar('id_type', { length: 30 }),
    idLast4: varchar('id_last4', { length: 4 }),

    /** Permanent authorisation vs a one-off (grandparent visiting this week). */
    isPermanent: boolean('is_permanent').notNull().default(true),
    validFrom: date('valid_from'),
    validTo: date('valid_to'),

    /** One-time code the parent generates in-app and shares verbally. */
    otpCodeHash: varchar('otp_code_hash', { length: 64 }),
    otpExpiresAt: timestamp('otp_expires_at', { withTimezone: true }),
    otpUsedAt: timestamp('otp_used_at', { withTimezone: true }),

    authorisedByUserId: uuid('authorised_by_user_id').references(() => users.id),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),

    isActive: isActive(),
    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    studentIdx: index('auth_pickups_student_idx').on(t.studentId, t.isActive),
  }),
);

/** The actual handover event. This is the record that settles disputes. */
export const pickupEvents = pgTable(
  'pickup_events',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),

    day: date('day').notNull(),
    method: pickupMethodEnum('method').notNull(),
    authorisedPickupId: uuid('authorised_pickup_id').references(() => authorisedPickups.id),

    handedOverAt: timestamp('handed_over_at', { withTimezone: true }).notNull().defaultNow(),
    /** The guard who released the child. Accountability. */
    releasedByUserId: uuid('released_by_user_id').references(() => users.id),

    /** 'qr' | 'otp' | 'photo_match' | 'manual_override' */
    verificationMethod: varchar('verification_method', { length: 30 }),
    /** Manual override requires a reason — and alerts the principal. */
    overrideReason: text('override_reason'),
    capturedPhotoPath: text('captured_photo_path'),

    parentNotifiedAt: timestamp('parent_notified_at', { withTimezone: true }),

    ...timestamps,
    ...syncable,
  },
  (t) => ({
    studentDayIdx: index('pickup_events_student_day_idx').on(t.studentId, t.day),
    branchDayIdx: index('pickup_events_branch_day_idx').on(t.branchId, t.day),
    overrideIdx: index('pickup_events_override_idx').on(t.tenantId, t.overrideReason),
  }),
);

/** D3 — Late arrival / early exit, written back to attendance. */
export const gatePasses = pgTable(
  'gate_passes',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),

    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    staffId: uuid('staff_id').references(() => staff.id, { onDelete: 'cascade' }),

    day: date('day').notNull(),
    /** 'late_arrival' | 'early_exit' | 'temporary_exit' */
    passType: varchar('pass_type', { length: 30 }).notNull(),
    exitTime: time('exit_time'),
    returnTime: time('return_time'),
    reason: text('reason'),

    approvedByUserId: uuid('approved_by_user_id').references(() => users.id),
    collectedByName: varchar('collected_by_name', { length: 150 }),
    recordedByUserId: uuid('recorded_by_user_id').references(() => users.id),

    ...timestamps,
    ...syncable,
  },
  (t) => ({
    dayIdx: index('gate_passes_day_idx').on(t.branchId, t.day),
    studentIdx: index('gate_passes_student_idx').on(t.studentId),
  }),
);

// ---------------------------------------------------------------------------
// B19 / D4 — Incidents & emergency
// ---------------------------------------------------------------------------

export const incidents = pgTable(
  'incidents',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),

    /** 'discipline' | 'injury' | 'bullying' | 'posh' | 'security' | 'property' | 'safe_report' */
    category: varchar('category', { length: 40 }).notNull(),
    severity: varchar('severity', { length: 20 }).notNull().default('low'),

    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }),
    location: varchar('location', { length: 150 }),

    /** Students involved. May be empty for a facility incident. */
    studentIds: jsonb('student_ids').$type<string[]>().default([]),
    staffIds: jsonb('staff_ids').$type<string[]>().default([]),

    reportedByUserId: uuid('reported_by_user_id').references(() => users.id),
    /**
     * F15 safe reporting: when TRUE the reporter's identity is hidden from
     * everyone except the routed handler. Controlled by the per-tenant
     * safe_reporting.enabled toggle (your decision #3).
     */
    isAnonymousReport: boolean('is_anonymous_report').notNull().default(false),

    /**
     * POSH, bullying and safe-report incidents are `restricted`: they need a
     * record_access_grant on top of the permission, and every read is logged.
     */
    sensitivity: sensitivityEnum('sensitivity').notNull().default('confidential'),

    status: varchar('status', { length: 30 }).notNull().default('open'),
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id),
    actionTaken: text('action_taken'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),

    parentInformedAt: timestamp('parent_informed_at', { withTimezone: true }),
    /** CCTV reference — we store the pointer and retention date, never video. */
    cctvCameraRef: varchar('cctv_camera_ref', { length: 80 }),
    cctvRetentionUntil: date('cctv_retention_until'),

    attachmentPaths: jsonb('attachment_paths').$type<string[]>().default([]),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    branchIdx: index('incidents_branch_idx').on(t.branchId, t.occurredAt),
    statusIdx: index('incidents_status_idx').on(t.tenantId, t.status),
    categoryIdx: index('incidents_category_idx').on(t.tenantId, t.category),
  }),
);

// ---------------------------------------------------------------------------
// D5–D8 — Transport
// ---------------------------------------------------------------------------

export const vehicles = pgTable(
  'vehicles',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),

    registrationNo: varchar('registration_no', { length: 20 }).notNull(),
    busNo: varchar('bus_no', { length: 20 }),
    make: varchar('make', { length: 60 }),
    model: varchar('model', { length: 60 }),
    seatingCapacity: smallint('seating_capacity'),
    yearOfManufacture: smallint('year_of_manufacture'),

    // --- Statutory safety kit (state mandates) ---
    hasGps: boolean('has_gps').notNull().default(false),
    gpsDeviceId: varchar('gps_device_id', { length: 60 }),
    hasCctv: boolean('has_cctv').notNull().default(false),
    cctvCameraCount: smallint('cctv_camera_count').default(0),
    hasPanicButton: boolean('has_panic_button').notNull().default(false),
    hasSeatBelts: boolean('has_seat_belts').notNull().default(false),
    hasFireExtinguisher: boolean('has_fire_extinguisher').notNull().default(false),
    hasFirstAidKit: boolean('has_first_aid_kit').notNull().default(false),

    // --- Document expiry (D8 alerts) ---
    insuranceExpiry: date('insurance_expiry'),
    fitnessExpiry: date('fitness_expiry'),
    permitExpiry: date('permit_expiry'),
    pucExpiry: date('puc_expiry'),
    taxValidTill: date('tax_valid_till'),

    driverStaffId: uuid('driver_staff_id').references(() => staff.id),
    attendantStaffId: uuid('attendant_staff_id').references(() => staff.id),

    isActive: isActive(),
    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    regUq: uniqueIndex('vehicles_reg_uq').on(t.tenantId, t.registrationNo),
    /** Compliance-expiry dashboard. */
    expiryIdx: index('vehicles_expiry_idx').on(t.branchId, t.fitnessExpiry, t.insuranceExpiry),
  }),
);

export const routes = pgTable(
  'routes',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
    academicSessionId: uuid('academic_session_id').references(() => academicSessions.id),

    code: varchar('code', { length: 30 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    vehicleId: uuid('vehicle_id').references(() => vehicles.id, { onDelete: 'set null' }),

    distanceKm: integer('distance_km'),
    estimatedMinutes: integer('estimated_minutes'),
    morningStartTime: time('morning_start_time'),
    afternoonStartTime: time('afternoon_start_time'),

    isActive: isActive(),
    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({ uq: uniqueIndex('routes_uq').on(t.branchId, t.code) }),
);

export const routeStops = pgTable(
  'route_stops',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    routeId: uuid('route_id').notNull().references(() => routes.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 150 }).notNull(),
    sequence: smallint('sequence').notNull(),
    latitude: varchar('latitude', { length: 20 }),
    longitude: varchar('longitude', { length: 20 }),
    /** Geofence radius for automatic arrival detection. */
    geofenceRadiusM: integer('geofence_radius_m').default(150),

    pickupTime: time('pickup_time'),
    dropTime: time('drop_time'),
    distanceFromSchoolKm: integer('distance_from_school_km'),
    /** Fee slab driven by distance — links to the transport fee head. */
    feeSlabPaise: paise('fee_slab_paise'),

    ...timestamps,
    ...syncable,
  },
  (t) => ({
    uq: uniqueIndex('route_stops_uq').on(t.routeId, t.sequence),
    routeIdx: index('route_stops_route_idx').on(t.routeId),
  }),
);

export const studentTransport = pgTable(
  'student_transport',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    academicSessionId: uuid('academic_session_id')
      .notNull()
      .references(() => academicSessions.id, { onDelete: 'cascade' }),

    routeId: uuid('route_id').references(() => routes.id, { onDelete: 'set null' }),
    pickupStopId: uuid('pickup_stop_id').references(() => routeStops.id),
    dropStopId: uuid('drop_stop_id').references(() => routeStops.id),

    /** RFID/QR card used at boarding. */
    rfidTag: varchar('rfid_tag', { length: 60 }),

    validFrom: date('valid_from'),
    validTo: date('valid_to'),
    isActive: isActive(),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    uq: uniqueIndex('student_transport_uq').on(t.studentId, t.academicSessionId),
    routeIdx: index('student_transport_route_idx').on(t.routeId),
    rfidIdx: index('student_transport_rfid_idx').on(t.rfidTag),
  }),
);

/** A single run of a route on a given day. */
export const trips = pgTable(
  'trips',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
    routeId: uuid('route_id').notNull().references(() => routes.id, { onDelete: 'cascade' }),
    vehicleId: uuid('vehicle_id').references(() => vehicles.id),

    day: date('day').notNull(),
    direction: tripDirectionEnum('direction').notNull(),

    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    driverStaffId: uuid('driver_staff_id').references(() => staff.id),
    attendantStaffId: uuid('attendant_staff_id').references(() => staff.id),

    /** Panic button / SOS pressed during this trip. */
    sosRaisedAt: timestamp('sos_raised_at', { withTimezone: true }),
    sosResolvedAt: timestamp('sos_resolved_at', { withTimezone: true }),

    boardedCount: smallint('boarded_count').notNull().default(0),
    expectedCount: smallint('expected_count').notNull().default(0),

    ...timestamps,
    ...syncable,
  },
  (t) => ({
    uq: uniqueIndex('trips_uq').on(t.routeId, t.day, t.direction),
    dayIdx: index('trips_day_idx').on(t.branchId, t.day),
  }),
);

/** D7 — the boarding scan. Regulatory requirement AND anxiety-solver. */
export const boardingLogs = pgTable(
  'boarding_logs',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    tripId: uuid('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    stopId: uuid('stop_id').references(() => routeStops.id),

    event: boardingEventEnum('event').notNull(),
    eventAt: timestamp('event_at', { withTimezone: true }).notNull().defaultNow(),
    /** 'rfid' | 'qr' | 'manual' | 'face' */
    scanMethod: varchar('scan_method', { length: 20 }).default('manual'),
    recordedByStaffId: uuid('recorded_by_staff_id').references(() => staff.id),

    latitude: varchar('latitude', { length: 20 }),
    longitude: varchar('longitude', { length: 20 }),

    parentNotifiedAt: timestamp('parent_notified_at', { withTimezone: true }),
    clientMutationId: uuid('client_mutation_id'),

    ...timestamps,
    ...syncable,
  },
  (t) => ({
    tripIdx: index('boarding_logs_trip_idx').on(t.tripId),
    studentIdx: index('boarding_logs_student_idx').on(t.studentId, t.eventAt),
    clientMutUq: uniqueIndex('boarding_logs_client_mut_uq').on(t.clientMutationId),
  }),
);

/**
 * GPS pings. APPEND-ONLY, HIGH VOLUME, SHORT RETENTION (7 days).
 * Live position is served from Redis, not from here. This table exists only
 * for after-the-fact route replay and dispute resolution.
 * Partition by day and drop old partitions — do not DELETE from it.
 */
export const vehiclePings = pgTable(
  'vehicle_pings',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    vehicleId: uuid('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
    tripId: uuid('trip_id').references(() => trips.id, { onDelete: 'cascade' }),

    pingedAt: timestamp('pinged_at', { withTimezone: true }).notNull(),
    latitude: varchar('latitude', { length: 20 }).notNull(),
    longitude: varchar('longitude', { length: 20 }).notNull(),
    speedKmph: smallint('speed_kmph'),
    heading: smallint('heading'),
    /** Speed-limit breach flag — feeds the driver-behaviour report. */
    isOverspeed: boolean('is_overspeed').notNull().default(false),
  },
  (t) => ({
    vehicleTimeIdx: index('vehicle_pings_vehicle_time_idx').on(t.vehicleId, t.pingedAt),
    tripIdx: index('vehicle_pings_trip_idx').on(t.tripId),
  }),
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const routesRelations = relations(routes, ({ many, one }) => ({
  stops: many(routeStops),
  trips: many(trips),
  vehicle: one(vehicles, { fields: [routes.vehicleId], references: [vehicles.id] }),
}));

export const tripsRelations = relations(trips, ({ many, one }) => ({
  boardingLogs: many(boardingLogs),
  route: one(routes, { fields: [trips.routeId], references: [routes.id] }),
}));

export const authorisedPickupsRelations = relations(authorisedPickups, ({ one, many }) => ({
  student: one(students, {
    fields: [authorisedPickups.studentId],
    references: [students.id],
  }),
  events: many(pickupEvents),
}));

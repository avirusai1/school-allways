/**
 * Module B1 — Student Information System. The core record of the whole product.
 *
 * SPLIT: `students` holds the PERSON (stable across years).
 *        `student_enrollments` holds the YEAR (class, section, roll no, status).
 * Never store current class on the student row — that's how you lose history.
 *
 * APAAR / UDISE fields are first-class columns, not a custom-fields blob.
 * APAAR is mandatory for all students Class 1-12 in AY 2026-27 and required for
 * CBSE Class 9/11 registration and Class 10/12 LOC. Schools are doing this in
 * spreadsheets right now — being good at it is a wedge with a deadline.
 */

import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  actorstamps,
  bloodGroupEnum,
  genderEnum,
  isActive,
  phoneCol,
  pk,
  sensitivityEnum,
  socialCategoryEnum,
  syncable,
  timestamps,
} from './_common';
import { branches, tenants } from './01-tenancy';
import { users } from './02-identity';
import { academicSessions, classes, sections } from './04-academic';
import { importBatches } from './16-import';

export const enrollmentStatusEnum = pgEnum('enrollment_status', [
  'enquiry',
  'applied',
  'admitted',
  'active',
  'on_leave',
  'transferred_out',
  'passed_out',
  'dropped_out',
  'expelled',
]);

export const guardianTypeEnum = pgEnum('guardian_type', [
  'father', 'mother', 'grandfather', 'grandmother',
  'uncle', 'aunt', 'sibling', 'legal_guardian', 'other',
]);

export const apaarStatusEnum = pgEnum('apaar_status', [
  'not_started',
  'consent_pending',   // physical Aadhaar consent form not yet returned
  'consent_received',
  'submitted',
  'generated',
  'mismatch',          // UDISE+ demographic mismatch — the worklist
  'rejected',
  'not_applicable',
]);

// ---------------------------------------------------------------------------
// Students — the person
// ---------------------------------------------------------------------------

export const students = pgTable(
  'students',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),

    /** Optional login. Created only when the school enables student access. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),

    admissionNo: varchar('admission_no', { length: 40 }).notNull(),
    admissionDate: date('admission_date'),

    firstName: varchar('first_name', { length: 80 }).notNull(),
    middleName: varchar('middle_name', { length: 80 }),
    lastName: varchar('last_name', { length: 80 }),
    dateOfBirth: date('date_of_birth'),
    gender: genderEnum('gender'),
    photoPath: text('photo_path'),

    bloodGroup: bloodGroupEnum('blood_group').default('unknown'),
    nationality: varchar('nationality', { length: 50 }).default('Indian'),
    religion: varchar('religion', { length: 50 }),
    motherTongue: varchar('mother_tongue', { length: 50 }),
    socialCategory: socialCategoryEnum('social_category'),
    /** RTE 25% quota student — drives fee exemption + separate reporting. */
    isRteStudent: boolean('is_rte_student').notNull().default(false),
    isDifferentlyAbled: boolean('is_differently_abled').notNull().default(false),
    disabilityType: varchar('disability_type', { length: 100 }),

    // --- Statutory identifiers ---
    /** 12-digit APAAR / ABC ID. */
    apaarId: varchar('apaar_id', { length: 12 }),
    apaarStatus: apaarStatusEnum('apaar_status').notNull().default('not_started'),
    apaarConsentReceivedAt: timestamp('apaar_consent_received_at', { withTimezone: true }),
    apaarGeneratedAt: timestamp('apaar_generated_at', { withTimezone: true }),
    apaarRemarks: text('apaar_remarks'),
    /** PEN — Permanent Education Number from UDISE+. */
    penNumber: varchar('pen_number', { length: 20 }),
    /**
     * Aadhaar is NEVER stored in full. We keep the last 4 digits for matching
     * and a hash for dedupe. Full number stays with the school's own consent
     * form. Storing full Aadhaar creates DPDP + Aadhaar Act exposure we do
     * not want on our servers.
     */
    aadhaarLast4: varchar('aadhaar_last4', { length: 4 }),
    aadhaarHash: varchar('aadhaar_hash', { length: 64 }),

    // --- Contact ---
    addressLine1: varchar('address_line1', { length: 200 }),
    addressLine2: varchar('address_line2', { length: 200 }),
    city: varchar('city', { length: 100 }),
    district: varchar('district', { length: 100 }),
    state: varchar('state', { length: 100 }),
    pincode: varchar('pincode', { length: 6 }),

    /** Sibling grouping for fee discounts — points at the eldest sibling. */
    siblingGroupId: uuid('sibling_group_id'),

    /** Free-form extras a school added via custom fields. */
    customFields: jsonb('custom_fields').$type<Record<string, unknown>>().default({}),

    /**
     * Set when created by bulk import — enables one-click undo by batch id
     * without rewriting a growing insertedIds JSONB blob.
     */
    importBatchId: uuid('import_batch_id').references(() => importBatches.id, {
      onDelete: 'set null',
    }),

    isActive: isActive(),
    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    admissionUq: uniqueIndex('students_admission_uq').on(t.branchId, t.admissionNo),
    tenantIdx: index('students_tenant_idx').on(t.tenantId),
    branchIdx: index('students_branch_idx').on(t.branchId),
    apaarIdx: index('students_apaar_idx').on(t.apaarId),
    apaarStatusIdx: index('students_apaar_status_idx').on(t.tenantId, t.apaarStatus),
    nameIdx: index('students_name_idx').on(t.firstName, t.lastName),
    siblingIdx: index('students_sibling_idx').on(t.siblingGroupId),
    importBatchIdx: index('students_import_batch_idx')
      .on(t.importBatchId)
      .where(sql`${t.importBatchId} is not null`),
  }),
);

// ---------------------------------------------------------------------------
// Enrollment — the year
// ---------------------------------------------------------------------------

export const studentEnrollments = pgTable(
  'student_enrollments',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    academicSessionId: uuid('academic_session_id')
      .notNull()
      .references(() => academicSessions.id, { onDelete: 'cascade' }),

    classId: uuid('class_id').notNull().references(() => classes.id),
    sectionId: uuid('section_id').references(() => sections.id),
    rollNo: varchar('roll_no', { length: 20 }),
    house: varchar('house', { length: 50 }),

    status: enrollmentStatusEnum('status').notNull().default('active'),
    joinedOn: date('joined_on'),
    leftOn: date('left_on'),
    leftReason: text('left_reason'),

    /** Set when the student is promoted into the next session. */
    promotedToEnrollmentId: uuid('promoted_to_enrollment_id'),

    /** Elective/optional subject choices for this year. */
    optionalSubjectIds: jsonb('optional_subject_ids').$type<string[]>().default([]),

    importBatchId: uuid('import_batch_id').references(() => importBatches.id, {
      onDelete: 'set null',
    }),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    uq: uniqueIndex('enrollments_student_session_uq').on(t.studentId, t.academicSessionId),
    sectionIdx: index('enrollments_section_idx').on(t.sectionId),
    sessionStatusIdx: index('enrollments_session_status_idx').on(t.academicSessionId, t.status),
    rollIdx: index('enrollments_roll_idx').on(t.sectionId, t.rollNo),
    importBatchIdx: index('student_enrollments_import_batch_idx')
      .on(t.importBatchId)
      .where(sql`${t.importBatchId} is not null`),
  }),
);

// ---------------------------------------------------------------------------
// Guardians
// ---------------------------------------------------------------------------

export const guardians = pgTable(
  'guardians',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    /** The login. One guardian row per human per tenant. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),

    fullName: varchar('full_name', { length: 150 }).notNull(),
    phone: phoneCol('phone'),
    altPhone: phoneCol('alt_phone'),
    email: varchar('email', { length: 254 }),
    photoPath: text('photo_path'),

    occupation: varchar('occupation', { length: 100 }),
    designation: varchar('designation', { length: 100 }),
    organisation: varchar('organisation', { length: 150 }),
    qualification: varchar('qualification', { length: 100 }),
    annualIncomePaise: integer('annual_income_paise'),

    aadhaarLast4: varchar('aadhaar_last4', { length: 4 }),

    importBatchId: uuid('import_batch_id').references(() => importBatches.id, {
      onDelete: 'set null',
    }),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    tenantPhoneIdx: index('guardians_tenant_phone_idx').on(t.tenantId, t.phone),
    userIdx: index('guardians_user_idx').on(t.userId),
    importBatchIdx: index('guardians_import_batch_idx')
      .on(t.importBatchId)
      .where(sql`${t.importBatchId} is not null`),
  }),
);

/**
 * Link table + per-guardian permission toggles.
 * Your decision #4: secondary guardian payment rights default ON, toggleable.
 */
export const studentGuardians = pgTable(
  'student_guardians',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    guardianId: uuid('guardian_id').notNull().references(() => guardians.id, { onDelete: 'cascade' }),

    relation: guardianTypeEnum('relation').notNull(),
    /** The DPDP consent holder + account owner. Exactly one per student. */
    isPrimary: boolean('is_primary').notNull().default(false),
    /** Receives SMS/calls first. */
    isEmergencyContact: boolean('is_emergency_contact').notNull().default(false),
    /** Lives with the child — matters for custody/communication edge cases. */
    residesWith: boolean('resides_with').notNull().default(true),

    // --- Per-guardian capability toggles ---
    canPayFees: boolean('can_pay_fees').notNull().default(true),
    canApproveLeave: boolean('can_approve_leave').notNull().default(true),
    canPickup: boolean('can_pickup').notNull().default(true),
    canViewAcademics: boolean('can_view_academics').notNull().default(true),
    canMessageTeachers: boolean('can_message_teachers').notNull().default(true),

    importBatchId: uuid('import_batch_id').references(() => importBatches.id, {
      onDelete: 'set null',
    }),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    uq: uniqueIndex('student_guardians_uq').on(t.studentId, t.guardianId),
    guardianIdx: index('student_guardians_guardian_idx').on(t.guardianId),
    studentIdx: index('student_guardians_student_idx').on(t.studentId),
    importBatchIdx: index('student_guardians_import_batch_idx')
      .on(t.importBatchId)
      .where(sql`${t.importBatchId} is not null`),
  }),
);

// ---------------------------------------------------------------------------
// Documents & medical
// ---------------------------------------------------------------------------

export const studentDocuments = pgTable(
  'student_documents',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),

    /** birth_certificate | transfer_certificate | caste | photo | aadhaar_consent | ... */
    docType: varchar('doc_type', { length: 50 }).notNull(),
    title: varchar('title', { length: 150 }),
    /** Relative key in the storage adapter — see StorageService. */
    filePath: text('file_path').notNull(),
    fileSizeBytes: integer('file_size_bytes'),
    mimeType: varchar('mime_type', { length: 100 }),

    isVerified: boolean('is_verified').notNull().default(false),
    verifiedBy: uuid('verified_by').references(() => users.id),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    expiresAt: date('expires_at'),

    sensitivity: sensitivityEnum('sensitivity').notNull().default('confidential'),

    ...timestamps,
    ...actorstamps,
  },
  (t) => ({
    studentIdx: index('student_documents_student_idx').on(t.studentId),
    typeIdx: index('student_documents_type_idx').on(t.tenantId, t.docType),
  }),
);

/** B18 — health record. Confidential tier: nurse + class teacher + parent only. */
export const studentHealth = pgTable(
  'student_health',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),

    heightCm: integer('height_cm'),
    weightKg: integer('weight_kg'),
    visionLeft: varchar('vision_left', { length: 20 }),
    visionRight: varchar('vision_right', { length: 20 }),

    allergies: text('allergies'),
    chronicConditions: text('chronic_conditions'),
    regularMedication: text('regular_medication'),
    /** Parent authorises the school nurse to administer listed medicines. */
    medicationConsent: boolean('medication_consent').notNull().default(false),

    doctorName: varchar('doctor_name', { length: 150 }),
    doctorPhone: phoneCol('doctor_phone'),
    insurancePolicyNo: varchar('insurance_policy_no', { length: 60 }),

    lastCheckupDate: date('last_checkup_date'),
    immunisationRecord: jsonb('immunisation_record').$type<Record<string, string>>(),

    sensitivity: sensitivityEnum('sensitivity').notNull().default('confidential'),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    studentUq: uniqueIndex('student_health_student_uq').on(t.studentId),
  }),
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const studentsRelations = relations(students, ({ many, one }) => ({
  enrollments: many(studentEnrollments),
  guardians: many(studentGuardians),
  documents: many(studentDocuments),
  health: one(studentHealth),
  user: one(users, { fields: [students.userId], references: [users.id] }),
}));

export const studentEnrollmentsRelations = relations(studentEnrollments, ({ one }) => ({
  student: one(students, {
    fields: [studentEnrollments.studentId],
    references: [students.id],
  }),
  section: one(sections, {
    fields: [studentEnrollments.sectionId],
    references: [sections.id],
  }),
  class: one(classes, { fields: [studentEnrollments.classId], references: [classes.id] }),
}));

export const studentGuardiansRelations = relations(studentGuardians, ({ one }) => ({
  student: one(students, {
    fields: [studentGuardians.studentId],
    references: [students.id],
  }),
  guardian: one(guardians, {
    fields: [studentGuardians.guardianId],
    references: [guardians.id],
  }),
}));

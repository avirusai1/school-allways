/**
 * Modules B2 / B5 / H — Staff records, assignments, leave.
 *
 * NOTE: Class Teacher and Subject Teacher are ROLES (see 03-rbac), not columns.
 * What lives here is the *assignment data* those roles are scoped by:
 *   - staff_section_assignments  -> which sections a teacher owns
 *   - staff_subject_assignments  -> which section+subject a teacher teaches
 * The RBAC scope resolver reads these to turn `scopeType='section'` into a
 * concrete list of section ids. That is the mechanism that stops a subject
 * teacher from reading another section's marks.
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
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  actorstamps,
  approvalStatusEnum,
  bloodGroupEnum,
  genderEnum,
  isActive,
  paise,
  phoneCol,
  pk,
  sensitivityEnum,
  socialCategoryEnum,
  syncable,
  timestamps,
} from './_common';
import { branches, tenants } from './01-tenancy';
import { users } from './02-identity';
import { academicSessions, sections, subjects } from './04-academic';
import { importBatches } from './16-import';

export const employmentTypeEnum = pgEnum('employment_type', [
  'permanent', 'probation', 'contract', 'visiting', 'part_time', 'intern', 'volunteer',
]);

export const staffStatusEnum = pgEnum('staff_status', [
  'active', 'on_leave', 'suspended', 'notice_period', 'resigned', 'terminated', 'retired',
]);

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export const staff = pgTable(
  'staff',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),

    employeeCode: varchar('employee_code', { length: 40 }).notNull(),
    firstName: varchar('first_name', { length: 80 }).notNull(),
    middleName: varchar('middle_name', { length: 80 }),
    lastName: varchar('last_name', { length: 80 }),
    dateOfBirth: date('date_of_birth'),
    gender: genderEnum('gender'),
    photoPath: text('photo_path'),
    bloodGroup: bloodGroupEnum('blood_group').default('unknown'),
    socialCategory: socialCategoryEnum('social_category'),

    /**
     * Work contact. THE TEACHER'S PERSONAL NUMBER IS NEVER EXPOSED TO PARENTS.
     * All parent↔teacher contact goes through the in-app masked channel (F3).
     * This is a headline promise of the product — enforce it in code.
     */
    workPhone: phoneCol('work_phone'),
    personalPhone: phoneCol('personal_phone'),
    workEmail: varchar('work_email', { length: 254 }),
    personalEmail: varchar('personal_email', { length: 254 }),

    addressLine1: varchar('address_line1', { length: 200 }),
    city: varchar('city', { length: 100 }),
    state: varchar('state', { length: 100 }),
    pincode: varchar('pincode', { length: 6 }),

    // --- Employment ---
    designation: varchar('designation', { length: 100 }),
    department: varchar('department', { length: 100 }),
    employmentType: employmentTypeEnum('employment_type').notNull().default('permanent'),
    status: staffStatusEnum('status').notNull().default('active'),
    joinedOn: date('joined_on'),
    confirmedOn: date('confirmed_on'),
    leftOn: date('left_on'),
    leftReason: text('left_reason'),
    reportsToStaffId: uuid('reports_to_staff_id'),

    /** Whether this person can be assigned to teach. */
    isTeaching: boolean('is_teaching').notNull().default(true),

    // --- Payroll (C6). Sensitive. ---
    basicSalaryPaise: paise('basic_salary_paise'),
    pfNumber: varchar('pf_number', { length: 30 }),
    esiNumber: varchar('esi_number', { length: 30 }),
    uanNumber: varchar('uan_number', { length: 20 }),
    panNumber: varchar('pan_number', { length: 10 }),
    bankAccountLast4: varchar('bank_account_last4', { length: 4 }),
    bankIfsc: varchar('bank_ifsc', { length: 11 }),

    /** Background verification — child-safety requirement. */
    isPoliceVerified: boolean('is_police_verified').notNull().default(false),
    policeVerifiedOn: date('police_verified_on'),

    customFields: jsonb('custom_fields').$type<Record<string, unknown>>().default({}),

    importBatchId: uuid('import_batch_id').references(() => importBatches.id, {
      onDelete: 'set null',
    }),

    isActive: isActive(),
    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    codeUq: uniqueIndex('staff_code_uq').on(t.branchId, t.employeeCode),
    tenantIdx: index('staff_tenant_idx').on(t.tenantId),
    branchStatusIdx: index('staff_branch_status_idx').on(t.branchId, t.status),
    userIdx: index('staff_user_idx').on(t.userId),
    importBatchIdx: index('staff_import_batch_idx')
      .on(t.importBatchId)
      .where(sql`${t.importBatchId} is not null`),
  }),
);

export const staffQualifications = pgTable(
  'staff_qualifications',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    staffId: uuid('staff_id').notNull().references(() => staff.id, { onDelete: 'cascade' }),

    /** Required in the CBSE mandatory-disclosure pack. */
    degree: varchar('degree', { length: 100 }).notNull(),
    specialisation: varchar('specialisation', { length: 100 }),
    institution: varchar('institution', { length: 200 }),
    yearOfPassing: smallint('year_of_passing'),
    percentage: integer('percentage'),
    certificatePath: text('certificate_path'),

    ...timestamps,
  },
  (t) => ({ staffIdx: index('staff_qual_staff_idx').on(t.staffId) }),
);

export const staffDocuments = pgTable(
  'staff_documents',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    staffId: uuid('staff_id').notNull().references(() => staff.id, { onDelete: 'cascade' }),

    docType: varchar('doc_type', { length: 50 }).notNull(),
    filePath: text('file_path').notNull(),
    expiresAt: date('expires_at'),
    sensitivity: sensitivityEnum('sensitivity').notNull().default('confidential'),

    ...timestamps,
    ...actorstamps,
  },
  (t) => ({ staffIdx: index('staff_docs_staff_idx').on(t.staffId) }),
);

// ---------------------------------------------------------------------------
// Teaching assignments — these ARE the RBAC data scope
// ---------------------------------------------------------------------------

/** Class Teacher / Assistant Class Teacher of a section, for a session. */
export const staffSectionAssignments = pgTable(
  'staff_section_assignments',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    staffId: uuid('staff_id').notNull().references(() => staff.id, { onDelete: 'cascade' }),
    sectionId: uuid('section_id').notNull().references(() => sections.id, { onDelete: 'cascade' }),
    academicSessionId: uuid('academic_session_id')
      .notNull()
      .references(() => academicSessions.id, { onDelete: 'cascade' }),

    /** 'class_teacher' | 'assistant' */
    assignmentType: varchar('assignment_type', { length: 30 }).notNull().default('class_teacher'),

    validFrom: date('valid_from'),
    validTo: date('valid_to'),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    uq: uniqueIndex('ssa_uq').on(t.staffId, t.sectionId, t.academicSessionId, t.assignmentType),
    staffIdx: index('ssa_staff_idx').on(t.staffId),
    sectionIdx: index('ssa_section_idx').on(t.sectionId),
  }),
);

/** Subject Teacher: which subject in which section. */
export const staffSubjectAssignments = pgTable(
  'staff_subject_assignments',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    staffId: uuid('staff_id').notNull().references(() => staff.id, { onDelete: 'cascade' }),
    sectionId: uuid('section_id').notNull().references(() => sections.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
    academicSessionId: uuid('academic_session_id')
      .notNull()
      .references(() => academicSessions.id, { onDelete: 'cascade' }),

    /** Can this teacher enter marks for this subject+section? */
    canEnterMarks: boolean('can_enter_marks').notNull().default(true),

    validFrom: date('valid_from'),
    validTo: date('valid_to'),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    uq: uniqueIndex('ssub_uq').on(t.staffId, t.sectionId, t.subjectId, t.academicSessionId),
    staffIdx: index('ssub_staff_idx').on(t.staffId),
    sectionSubjectIdx: index('ssub_section_subject_idx').on(t.sectionId, t.subjectId),
  }),
);

// ---------------------------------------------------------------------------
// Leave (B5) — covers both staff leave and student leave
// ---------------------------------------------------------------------------

export const leaveTypes = pgTable(
  'leave_types',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'cascade' }),

    code: varchar('code', { length: 20 }).notNull(),
    name: varchar('name', { length: 80 }).notNull(),
    /** 'staff' | 'student' */
    appliesTo: varchar('applies_to', { length: 20 }).notNull().default('staff'),
    annualQuota: integer('annual_quota'),
    isPaid: boolean('is_paid').notNull().default(true),
    carryForward: boolean('carry_forward').notNull().default(false),
    requiresDocument: boolean('requires_document').notNull().default(false),

    isActive: isActive(),
    ...timestamps,
    ...syncable,
  },
  (t) => ({
    /**
     * NULLS NOT DISTINCT — branch_id IS NULL means "tenant-wide leave type".
     * Without it two "casual" leave types for the same tenant with a NULL
     * branch both survive, and leave balances attach to whichever one the
     * picker happens to show.
     */
    uq: unique('leave_types_uq').on(t.tenantId, t.branchId, t.code).nullsNotDistinct(),
  }),
);

export const leaveRequests = pgTable(
  'leave_requests',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
    leaveTypeId: uuid('leave_type_id').references(() => leaveTypes.id),

    /** Exactly one of these is set. */
    staffId: uuid('staff_id').references(() => staff.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id'),

    /** Who submitted — for a student this is usually the parent's user id. */
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id),

    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
    isHalfDay: boolean('is_half_day').notNull().default(false),
    dayCount: integer('day_count').notNull().default(1),
    reason: text('reason'),
    attachmentPath: text('attachment_path'),

    status: approvalStatusEnum('status').notNull().default('pending'),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    staffIdx: index('leave_req_staff_idx').on(t.staffId),
    studentIdx: index('leave_req_student_idx').on(t.studentId),
    statusIdx: index('leave_req_status_idx').on(t.tenantId, t.status),
    /**
     * The approvals tile asks "what is waiting on this branch" on every
     * dashboard load. Partial, so the index stays the size of the queue rather
     * than the size of every leave ever taken.
     */
    pendingIdx: index('leave_req_pending_idx')
      .on(t.branchId)
      .where(sql`${t.status} = 'pending'`),
    dateIdx: index('leave_req_date_idx').on(t.fromDate, t.toDate),
  }),
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const staffRelations = relations(staff, ({ many, one }) => ({
  qualifications: many(staffQualifications),
  documents: many(staffDocuments),
  sectionAssignments: many(staffSectionAssignments),
  subjectAssignments: many(staffSubjectAssignments),
  user: one(users, { fields: [staff.userId], references: [users.id] }),
  branch: one(branches, { fields: [staff.branchId], references: [branches.id] }),
}));

export const staffSubjectAssignmentsRelations = relations(
  staffSubjectAssignments,
  ({ one }) => ({
    staff: one(staff, { fields: [staffSubjectAssignments.staffId], references: [staff.id] }),
    section: one(sections, {
      fields: [staffSubjectAssignments.sectionId],
      references: [sections.id],
    }),
    subject: one(subjects, {
      fields: [staffSubjectAssignments.subjectId],
      references: [subjects.id],
    }),
  }),
);

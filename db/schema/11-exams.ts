/**
 * Modules B10 / B11 — Exams, marks, exam timetable, report cards, HPC.
 * (Your request #8: teachers upload test marks, tests, and exam timetable.)
 *
 * TWO ASSESSMENT WORLDS COEXIST IN AN INDIAN SCHOOL IN 2026, and the schema
 * must carry both:
 *
 *   A. TRADITIONAL MARKS. exam -> exam_subjects -> marks. Grading scales,
 *      weightages, moderation, results. Familiar, numeric.
 *
 *   B. HOLISTIC PROGRESS CARD (NEP 2020 / CBSE). Observations, portfolios,
 *      project work, self- and peer-assessment across scholastic AND
 *      co-scholastic domains, with qualitative descriptors instead of marks.
 *      This is a fundamentally different shape — modelled as
 *      hpc_domains -> hpc_indicators -> hpc_assessments.
 *
 * Do not try to force B into B's shape. Schools run both simultaneously.
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
  approvalStatusEnum,
  basisPoints,
  isActive,
  pk,
  syncable,
  timestamps,
} from './_common';
import { branches, tenants } from './01-tenancy';
import { users } from './02-identity';
import { academicSessions, classes, sections, subjects, terms } from './04-academic';
import { staff } from './06-staff';
import { students } from './05-students';

export const examTypeEnum = pgEnum('exam_type', [
  'unit_test', 'periodic_test', 'mid_term', 'half_yearly', 'final',
  'pre_board', 'board', 'practical', 'internal_assessment',
  'project', 'oral', 'class_test',
]);

export const marksEntryStatusEnum = pgEnum('marks_entry_status', [
  'not_started', 'in_progress', 'submitted', 'moderated', 'locked', 'published',
]);

export const resultStatusEnum = pgEnum('result_status', [
  'pass', 'fail', 'compartment', 'absent', 'withheld', 'not_applicable',
]);

// ---------------------------------------------------------------------------
// Grading scales
// ---------------------------------------------------------------------------

export const gradingScales = pgTable(
  'grading_scales',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 80 }).notNull(),
    /** 'marks' | 'grade' | 'descriptor' — descriptor is the HPC style. */
    scaleType: varchar('scale_type', { length: 20 }).notNull().default('grade'),
    isDefault: boolean('is_default').notNull().default(false),

    isActive: isActive(),
    ...timestamps,
    ...syncable,
  },
  (t) => ({ uq: uniqueIndex('grading_scales_uq').on(t.branchId, t.name) }),
);

export const gradeBands = pgTable(
  'grade_bands',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    gradingScaleId: uuid('grading_scale_id')
      .notNull()
      .references(() => gradingScales.id, { onDelete: 'cascade' }),

    grade: varchar('grade', { length: 10 }).notNull(),
    minPercentageBp: basisPoints('min_percentage_bp').notNull(),
    maxPercentageBp: basisPoints('max_percentage_bp').notNull(),
    gradePoint: integer('grade_point'),
    descriptor: varchar('descriptor', { length: 200 }),
    sequence: smallint('sequence').default(0),

    ...timestamps,
    ...syncable,
  },
  (t) => ({ scaleIdx: index('grade_bands_scale_idx').on(t.gradingScaleId) }),
);

// ---------------------------------------------------------------------------
// Exams
// ---------------------------------------------------------------------------

export const exams = pgTable(
  'exams',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
    academicSessionId: uuid('academic_session_id')
      .notNull()
      .references(() => academicSessions.id, { onDelete: 'cascade' }),
    termId: uuid('term_id').references(() => terms.id, { onDelete: 'set null' }),

    name: varchar('name', { length: 120 }).notNull(),
    type: examTypeEnum('type').notNull().default('unit_test'),
    gradingScaleId: uuid('grading_scale_id').references(() => gradingScales.id),

    startDate: date('start_date'),
    endDate: date('end_date'),

    /** Contribution of this exam to the term result, in basis points. */
    weightageBp: basisPoints('weightage_bp').default(10000),

    /** Which classes sit this exam. Empty = all. */
    classIds: jsonb('class_ids').$type<string[]>().default([]),

    /** Gate: marks are hidden from parents until published. */
    isPublished: boolean('is_published').notNull().default(false),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    /** Timetable visible to students/parents before results are. */
    isTimetablePublished: boolean('is_timetable_published').notNull().default(false),

    status: approvalStatusEnum('status').notNull().default('draft'),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    sessionIdx: index('exams_session_idx').on(t.academicSessionId),
    branchDateIdx: index('exams_branch_date_idx').on(t.branchId, t.startDate),
  }),
);

/** Exam timetable — one row per exam x class x subject. */
export const examSchedules = pgTable(
  'exam_schedules',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    examId: uuid('exam_id').notNull().references(() => exams.id, { onDelete: 'cascade' }),
    classId: uuid('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),

    examDate: date('exam_date').notNull(),
    startTime: time('start_time'),
    endTime: time('end_time'),
    durationMinutes: integer('duration_minutes'),

    maxMarks: integer('max_marks').notNull().default(100),
    passMarks: integer('pass_marks').default(33),
    /** Theory/practical split for science subjects. */
    theoryMaxMarks: integer('theory_max_marks'),
    practicalMaxMarks: integer('practical_max_marks'),

    roomNo: varchar('room_no', { length: 40 }),
    invigilatorStaffId: uuid('invigilator_staff_id').references(() => staff.id),
    syllabusNote: text('syllabus_note'),
    /** Question paper — released only after the exam starts. */
    questionPaperPath: text('question_paper_path'),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    uq: uniqueIndex('exam_schedules_uq').on(t.examId, t.classId, t.subjectId),
    examIdx: index('exam_schedules_exam_idx').on(t.examId),
    dateIdx: index('exam_schedules_date_idx').on(t.tenantId, t.examDate),
  }),
);

// ---------------------------------------------------------------------------
// Marks
// ---------------------------------------------------------------------------

/** Header row per exam x section x subject — tracks entry progress. */
export const marksSheets = pgTable(
  'marks_sheets',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    examId: uuid('exam_id').notNull().references(() => exams.id, { onDelete: 'cascade' }),
    sectionId: uuid('section_id').notNull().references(() => sections.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),

    status: marksEntryStatusEnum('status').notNull().default('not_started'),
    enteredByStaffId: uuid('entered_by_staff_id').references(() => staff.id),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),

    moderatedByUserId: uuid('moderated_by_user_id').references(() => users.id),
    moderatedAt: timestamp('moderated_at', { withTimezone: true }),
    moderationNote: text('moderation_note'),

    lockedAt: timestamp('locked_at', { withTimezone: true }),

    entryCount: smallint('entry_count').notNull().default(0),
    expectedCount: smallint('expected_count').notNull().default(0),

    clientMutationId: uuid('client_mutation_id'),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    uq: uniqueIndex('marks_sheets_uq').on(t.examId, t.sectionId, t.subjectId),
    /** Coordinator's "who hasn't entered marks yet" view. */
    statusIdx: index('marks_sheets_status_idx').on(t.tenantId, t.status),
    clientMutUq: uniqueIndex('marks_sheets_client_mut_uq').on(t.clientMutationId),
  }),
);

export const marks = pgTable(
  'marks',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    marksSheetId: uuid('marks_sheet_id')
      .notNull()
      .references(() => marksSheets.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),

    /** Denormalised so a student's full mark history is one index scan. */
    examId: uuid('exam_id').notNull(),
    subjectId: uuid('subject_id').notNull(),

    marksObtained: integer('marks_obtained'),
    theoryMarks: integer('theory_marks'),
    practicalMarks: integer('practical_marks'),
    internalMarks: integer('internal_marks'),
    maxMarks: integer('max_marks').notNull().default(100),

    grade: varchar('grade', { length: 10 }),
    percentageBp: basisPoints('percentage_bp'),

    isAbsent: boolean('is_absent').notNull().default(false),
    isExempted: boolean('is_exempted').notNull().default(false),
    remarks: varchar('remarks', { length: 300 }),

    /** Original value before moderation — never overwrite the teacher's entry. */
    originalMarks: integer('original_marks'),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    uq: uniqueIndex('marks_uq').on(t.marksSheetId, t.studentId),
    studentExamIdx: index('marks_student_exam_idx').on(t.studentId, t.examId),
    studentSubjectIdx: index('marks_student_subject_idx').on(t.studentId, t.subjectId),
  }),
);

// ---------------------------------------------------------------------------
// Results & report cards (B11)
// ---------------------------------------------------------------------------

export const results = pgTable(
  'results',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    academicSessionId: uuid('academic_session_id')
      .notNull()
      .references(() => academicSessions.id, { onDelete: 'cascade' }),
    termId: uuid('term_id').references(() => terms.id),
    examId: uuid('exam_id').references(() => exams.id, { onDelete: 'cascade' }),

    totalMarks: integer('total_marks'),
    obtainedMarks: integer('obtained_marks'),
    percentageBp: basisPoints('percentage_bp'),
    grade: varchar('grade', { length: 10 }),
    cgpa: integer('cgpa'),

    rankInSection: smallint('rank_in_section'),
    rankInClass: smallint('rank_in_class'),

    status: resultStatusEnum('status').notNull().default('pass'),
    failedSubjectIds: jsonb('failed_subject_ids').$type<string[]>().default([]),

    attendancePercentageBp: basisPoints('attendance_percentage_bp'),
    classTeacherRemarks: text('class_teacher_remarks'),
    principalRemarks: text('principal_remarks'),

    isPublished: boolean('is_published').notNull().default(false),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    reportCardPath: text('report_card_path'),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    uq: uniqueIndex('results_uq').on(t.studentId, t.examId),
    sessionIdx: index('results_session_idx').on(t.academicSessionId, t.termId),
    studentIdx: index('results_student_idx').on(t.studentId),
  }),
);

export const reportCardTemplates = pgTable(
  'report_card_templates',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 120 }).notNull(),
    /** 'cbse_standard' | 'icse' | 'hpc' | 'custom' */
    format: varchar('format', { length: 40 }).notNull().default('cbse_standard'),
    /** Class levels this template applies to. */
    appliesToClassIds: jsonb('applies_to_class_ids').$type<string[]>().default([]),

    /** Layout definition consumed by the PDF renderer. */
    layout: jsonb('layout').$type<Record<string, unknown>>().notNull().default({}),
    headerImagePath: text('header_image_path'),
    signaturePaths: jsonb('signature_paths').$type<Record<string, string>>().default({}),

    isDefault: boolean('is_default').notNull().default(false),
    isActive: isActive(),
    ...timestamps,
    ...actorstamps,
  },
  (t) => ({ branchIdx: index('rc_templates_branch_idx').on(t.branchId) }),
);

// ---------------------------------------------------------------------------
// Holistic Progress Card (NEP 2020)
// ---------------------------------------------------------------------------

/** Domains: Cognitive, Socio-emotional, Physical, Creative, Language... */
export const hpcDomains = pgTable(
  'hpc_domains',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),

    code: varchar('code', { length: 30 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    /** 'foundational' | 'preparatory' | 'middle' | 'secondary' — NEP stages. */
    stage: varchar('stage', { length: 30 }),
    sequence: smallint('sequence').default(0),

    isActive: isActive(),
    ...timestamps,
    ...syncable,
  },
  (t) => ({ uq: uniqueIndex('hpc_domains_uq').on(t.branchId, t.code) }),
);

export const hpcIndicators = pgTable(
  'hpc_indicators',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    domainId: uuid('domain_id').notNull().references(() => hpcDomains.id, { onDelete: 'cascade' }),

    code: varchar('code', { length: 40 }).notNull(),
    statement: text('statement').notNull(),
    /** ['beginner','progressing','proficient','advanced'] */
    levels: jsonb('levels').$type<string[]>().notNull().default([]),
    sequence: smallint('sequence').default(0),

    ...timestamps,
    ...syncable,
  },
  (t) => ({ domainIdx: index('hpc_indicators_domain_idx').on(t.domainId) }),
);

/**
 * The actual observation. `assessorType` is what makes this the HPC and not a
 * marks table: the same indicator is rated by the teacher, the student
 * (self), a peer, and the parent.
 */
export const hpcAssessments = pgTable(
  'hpc_assessments',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    indicatorId: uuid('indicator_id')
      .notNull()
      .references(() => hpcIndicators.id, { onDelete: 'cascade' }),
    academicSessionId: uuid('academic_session_id')
      .notNull()
      .references(() => academicSessions.id, { onDelete: 'cascade' }),
    termId: uuid('term_id').references(() => terms.id),

    /** 'teacher' | 'self' | 'peer' | 'parent' */
    assessorType: varchar('assessor_type', { length: 20 }).notNull().default('teacher'),
    assessorUserId: uuid('assessor_user_id').references(() => users.id),

    level: varchar('level', { length: 40 }),
    observationNote: text('observation_note'),
    /** Portfolio artefacts: project photos, worksheets, recordings. */
    evidencePaths: jsonb('evidence_paths').$type<string[]>().default([]),

    observedOn: date('observed_on'),
    clientMutationId: uuid('client_mutation_id'),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    uq: uniqueIndex('hpc_assessments_uq').on(
      t.studentId, t.indicatorId, t.termId, t.assessorType, t.assessorUserId,
    ),
    studentIdx: index('hpc_assessments_student_idx').on(t.studentId, t.termId),
    clientMutUq: uniqueIndex('hpc_assessments_client_mut_uq').on(t.clientMutationId),
  }),
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const examsRelations = relations(exams, ({ many }) => ({
  schedules: many(examSchedules),
  marksSheets: many(marksSheets),
  results: many(results),
}));

export const marksSheetsRelations = relations(marksSheets, ({ many, one }) => ({
  marks: many(marks),
  exam: one(exams, { fields: [marksSheets.examId], references: [exams.id] }),
  section: one(sections, { fields: [marksSheets.sectionId], references: [sections.id] }),
  subject: one(subjects, { fields: [marksSheets.subjectId], references: [subjects.id] }),
}));

export const marksRelations = relations(marks, ({ one }) => ({
  sheet: one(marksSheets, {
    fields: [marks.marksSheetId],
    references: [marksSheets.id],
  }),
  student: one(students, { fields: [marks.studentId], references: [students.id] }),
}));

export const hpcDomainsRelations = relations(hpcDomains, ({ many }) => ({
  indicators: many(hpcIndicators),
}));

/**
 * Modules B8 / B27 / B28 — Homework, digital diary, surveys, gallery.
 *
 * Part of the FREE TIER wedge. Homework posted here instead of a WhatsApp
 * group is the single most visible daily win for both teacher and parent.
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
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { actorstamps, isActive, pk, syncable, timestamps } from './_common';
import { branches, tenants } from './01-tenancy';
import { users } from './02-identity';
import { sections, subjects } from './04-academic';
import { staff } from './06-staff';
import { students } from './05-students';

export const homeworkStatusEnum = pgEnum('homework_status', [
  'draft', 'published', 'closed', 'cancelled',
]);

export const submissionStatusEnum = pgEnum('submission_status', [
  'pending', 'submitted', 'late', 'graded', 'resubmit', 'excused',
]);

// ---------------------------------------------------------------------------
// Homework
// ---------------------------------------------------------------------------

export const homework = pgTable(
  'homework',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),

    sectionId: uuid('section_id').notNull().references(() => sections.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
    assignedByStaffId: uuid('assigned_by_staff_id').references(() => staff.id),

    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    attachmentPaths: jsonb('attachment_paths').$type<string[]>().default([]),

    assignedOn: date('assigned_on').notNull(),
    dueOn: date('due_on'),
    estimatedMinutes: integer('estimated_minutes'),

    status: homeworkStatusEnum('status').notNull().default('published'),
    /** Turns on the submission workflow. Off = read-only notice. */
    requiresSubmission: boolean('requires_submission').notNull().default(false),
    allowLateSubmission: boolean('allow_late_submission').notNull().default(true),
    maxMarks: integer('max_marks'),

    /** Denormalised for the teacher's "27 of 40 seen" widget. */
    seenCount: integer('seen_count').notNull().default(0),
    submittedCount: integer('submitted_count').notNull().default(0),

    clientMutationId: uuid('client_mutation_id'),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    sectionDateIdx: index('homework_section_date_idx').on(t.sectionId, t.assignedOn),
    dueIdx: index('homework_due_idx').on(t.tenantId, t.dueOn),
    staffIdx: index('homework_staff_idx').on(t.assignedByStaffId),
    clientMutUq: uniqueIndex('homework_client_mut_uq').on(t.clientMutationId),
  }),
);

export const homeworkSubmissions = pgTable(
  'homework_submissions',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    homeworkId: uuid('homework_id')
      .notNull()
      .references(() => homework.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),

    status: submissionStatusEnum('status').notNull().default('pending'),
    /** Parent/student tapped it open — the read receipt WhatsApp never gave. */
    seenAt: timestamp('seen_at', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),

    responseText: text('response_text'),
    attachmentPaths: jsonb('attachment_paths').$type<string[]>().default([]),

    marksObtained: integer('marks_obtained'),
    teacherRemarks: text('teacher_remarks'),
    gradedByStaffId: uuid('graded_by_staff_id').references(() => staff.id),
    gradedAt: timestamp('graded_at', { withTimezone: true }),

    ...timestamps,
    ...syncable,
  },
  (t) => ({
    uq: uniqueIndex('homework_submissions_uq').on(t.homeworkId, t.studentId),
    studentIdx: index('homework_submissions_student_idx').on(t.studentId),
    statusIdx: index('homework_submissions_status_idx').on(t.homeworkId, t.status),
  }),
);

// ---------------------------------------------------------------------------
// Digital diary — the daily note home
// ---------------------------------------------------------------------------

export const diaryEntries = pgTable(
  'diary_entries',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),

    sectionId: uuid('section_id').references(() => sections.id, { onDelete: 'cascade' }),
    /** Set for a note about one child; null = whole-section note. */
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    authorStaffId: uuid('author_staff_id').references(() => staff.id),

    day: date('day').notNull(),
    /** 'note' | 'appreciation' | 'concern' | 'reminder' | 'observation' */
    entryType: varchar('entry_type', { length: 30 }).notNull().default('note'),
    body: text('body').notNull(),
    attachmentPaths: jsonb('attachment_paths').$type<string[]>().default([]),

    /** Observations feed the Holistic Progress Card (B11). */
    feedsHpc: boolean('feeds_hpc').notNull().default(false),

    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    acknowledgedByUserId: uuid('acknowledged_by_user_id').references(() => users.id),

    clientMutationId: uuid('client_mutation_id'),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    sectionDayIdx: index('diary_section_day_idx').on(t.sectionId, t.day),
    studentIdx: index('diary_student_idx').on(t.studentId, t.day),
    clientMutUq: uniqueIndex('diary_client_mut_uq').on(t.clientMutationId),
  }),
);

// ---------------------------------------------------------------------------
// B27 — Surveys, polls, consent forms
// ---------------------------------------------------------------------------

export const surveys = pgTable(
  'surveys',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'cascade' }),

    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    /** 'survey' | 'poll' | 'consent_form' | 'option_selection' | 'nps' */
    surveyType: varchar('survey_type', { length: 30 }).notNull().default('survey'),

    /** [{id,type,label,options[],required}] */
    questions: jsonb('questions').$type<Record<string, unknown>[]>().notNull().default([]),

    audienceType: varchar('audience_type', { length: 30 }).notNull().default('all_parents'),
    audienceRefs: jsonb('audience_refs').$type<Record<string, string[]>>().default({}),

    opensAt: timestamp('opens_at', { withTimezone: true }),
    closesAt: timestamp('closes_at', { withTimezone: true }),
    isAnonymous: boolean('is_anonymous').notNull().default(false),
    isMandatory: boolean('is_mandatory').notNull().default(false),

    responseCount: integer('response_count').notNull().default(0),
    isActive: isActive(),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({ tenantIdx: index('surveys_tenant_idx').on(t.tenantId, t.createdAt) }),
);

export const surveyResponses = pgTable(
  'survey_responses',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    surveyId: uuid('survey_id').notNull().references(() => surveys.id, { onDelete: 'cascade' }),

    /** Null when the survey is anonymous. */
    respondentUserId: uuid('respondent_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),

    answers: jsonb('answers').$type<Record<string, unknown>>().notNull().default({}),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow(),

    ...timestamps,
    ...syncable,
  },
  (t) => ({
    uq: uniqueIndex('survey_responses_uq').on(t.surveyId, t.respondentUserId, t.studentId),
    surveyIdx: index('survey_responses_survey_idx').on(t.surveyId),
  }),
);

// ---------------------------------------------------------------------------
// B28 — Gallery (drives daily parent app-opens)
// ---------------------------------------------------------------------------

export const galleryAlbums = pgTable(
  'gallery_albums',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),

    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    coverPath: text('cover_path'),
    eventDate: date('event_date'),

    audienceType: varchar('audience_type', { length: 30 }).notNull().default('all_parents'),
    audienceRefs: jsonb('audience_refs').$type<Record<string, string[]>>().default({}),

    /**
     * Photos of children are personal data of minors under DPDP. Publishing
     * requires the school to hold media consent; this flag is checked before
     * an album can be published.
     */
    mediaConsentVerified: boolean('media_consent_verified').notNull().default(false),
    isPublished: boolean('is_published').notNull().default(false),
    photoCount: integer('photo_count').notNull().default(0),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({ branchIdx: index('gallery_albums_branch_idx').on(t.branchId, t.eventDate) }),
);

export const galleryPhotos = pgTable(
  'gallery_photos',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    albumId: uuid('album_id')
      .notNull()
      .references(() => galleryAlbums.id, { onDelete: 'cascade' }),

    filePath: text('file_path').notNull(),
    thumbPath: text('thumb_path'),
    caption: varchar('caption', { length: 300 }),
    fileSizeBytes: integer('file_size_bytes'),
    sequence: integer('sequence').default(0),

    ...timestamps,
    ...actorstamps,
  },
  (t) => ({ albumIdx: index('gallery_photos_album_idx').on(t.albumId, t.sequence) }),
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const homeworkRelations = relations(homework, ({ many, one }) => ({
  submissions: many(homeworkSubmissions),
  section: one(sections, { fields: [homework.sectionId], references: [sections.id] }),
  subject: one(subjects, { fields: [homework.subjectId], references: [subjects.id] }),
}));

export const homeworkSubmissionsRelations = relations(homeworkSubmissions, ({ one }) => ({
  homework: one(homework, {
    fields: [homeworkSubmissions.homeworkId],
    references: [homework.id],
  }),
  student: one(students, {
    fields: [homeworkSubmissions.studentId],
    references: [students.id],
  }),
}));

export const galleryAlbumsRelations = relations(galleryAlbums, ({ many }) => ({
  photos: many(galleryPhotos),
}));

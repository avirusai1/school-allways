/**
 * Modules A4 / A5 / B7 — Academic sessions, calendar, class structure, timetable.
 *
 * YEAR ROLLOVER IS WHERE COMPETITORS BLEED CUSTOMERS. Every academic entity is
 * bound to an `academic_session_id`, never to "current". Promotion creates new
 * enrolment rows in the next session; nothing is mutated in place. A school can
 * therefore always look at last year exactly as it was.
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
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { actorstamps, isActive, pk, syncable, timestamps } from './_common';
import { branches, tenants } from './01-tenancy';

export const termTypeEnum = pgEnum('term_type', [
  'term', 'semester', 'quarter', 'trimester',
]);

export const dayTypeEnum = pgEnum('day_type', [
  'working', 'holiday', 'weekend', 'exam', 'half_day', 'event', 'vacation',
]);

// ---------------------------------------------------------------------------
// Academic sessions & terms
// ---------------------------------------------------------------------------

export const academicSessions = pgTable(
  'academic_sessions',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'cascade' }),

    /** e.g. '2026-27' */
    name: varchar('name', { length: 30 }).notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),

    isCurrent: boolean('is_current').notNull().default(false),
    /** Locked sessions are read-only — set after results are published. */
    isLocked: boolean('is_locked').notNull().default(false),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    /**
     * NULLS NOT DISTINCT — branch_id IS NULL means "tenant-wide session".
     * Without it two "2025-26" sessions for the same tenant with a NULL branch
     * both survive, and year-rollover / "current session" queries become
     * ambiguous.
     */
    uq: unique('academic_sessions_uq')
      .on(t.tenantId, t.branchId, t.name)
      .nullsNotDistinct(),
    currentIdx: index('academic_sessions_current_idx').on(t.tenantId, t.isCurrent),
  }),
);

export const terms = pgTable(
  'terms',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    academicSessionId: uuid('academic_session_id')
      .notNull()
      .references(() => academicSessions.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 60 }).notNull(),
    type: termTypeEnum('type').notNull().default('term'),
    sequence: smallint('sequence').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),

    ...timestamps,
    ...syncable,
  },
  (t) => ({
    sessionIdx: index('terms_session_idx').on(t.academicSessionId),
    uq: uniqueIndex('terms_session_seq_uq').on(t.academicSessionId, t.sequence),
  }),
);

/** Calendar — holidays, working days, exam days. Drives attendance denominators. */
export const calendarDays = pgTable(
  'calendar_days',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'cascade' }),
    academicSessionId: uuid('academic_session_id')
      .notNull()
      .references(() => academicSessions.id, { onDelete: 'cascade' }),

    day: date('day').notNull(),
    dayType: dayTypeEnum('day_type').notNull().default('working'),
    title: varchar('title', { length: 150 }),
    /** Limit a holiday to certain classes, e.g. only pre-primary. Null = all. */
    appliesToClassIds: jsonb('applies_to_class_ids').$type<string[]>(),

    ...timestamps,
    ...syncable,
  },
  (t) => ({
    /**
     * NULLS NOT DISTINCT — branch_id IS NULL means "tenant-wide calendar day".
     * Without it a holiday (or a working day) can be recorded twice for the
     * same session and day at the tenant level, and attendance denominators
     * disagree with the principal's calendar.
     */
    uq: unique('calendar_days_uq')
      .on(t.tenantId, t.branchId, t.academicSessionId, t.day)
      .nullsNotDistinct(),
    dayIdx: index('calendar_days_day_idx').on(t.day),
  }),
);

// ---------------------------------------------------------------------------
// Class structure
// ---------------------------------------------------------------------------

/** A grade level: Nursery, LKG, I, II ... XII. */
export const classes = pgTable(
  'classes',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 50 }).notNull(),
    /** Numeric ordering: Nursery=-3, LKG=-2, UKG=-1, I=1 ... XII=12. */
    level: smallint('level').notNull(),
    /** 'pre_primary' | 'primary' | 'middle' | 'secondary' | 'senior_secondary' */
    stage: varchar('stage', { length: 30 }),
    /** Stream for XI/XII: science / commerce / humanities. */
    stream: varchar('stream', { length: 40 }),

    isActive: isActive(),
    ...timestamps,
    ...syncable,
  },
  (t) => ({
    uq: uniqueIndex('classes_uq').on(t.branchId, t.name, t.stream),
    branchIdx: index('classes_branch_idx').on(t.branchId),
  }),
);

/** A section: V-A, V-B. The unit a Class Teacher owns. */
export const sections = pgTable(
  'sections',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
    classId: uuid('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
    academicSessionId: uuid('academic_session_id')
      .notNull()
      .references(() => academicSessions.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 20 }).notNull(),
    capacity: integer('capacity'),
    roomNo: varchar('room_no', { length: 30 }),

    /** The class teacher. FK added in 06-staff to avoid a circular import. */
    classTeacherStaffId: uuid('class_teacher_staff_id'),
    assistantTeacherStaffId: uuid('assistant_teacher_staff_id'),

    isActive: isActive(),
    ...timestamps,
    ...syncable,
  },
  (t) => ({
    uq: uniqueIndex('sections_uq').on(t.classId, t.academicSessionId, t.name),
    branchIdx: index('sections_branch_idx').on(t.branchId),
    sessionIdx: index('sections_session_idx').on(t.academicSessionId),
  }),
);

export const subjects = pgTable(
  'subjects',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),

    code: varchar('code', { length: 30 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    shortName: varchar('short_name', { length: 20 }),
    /** 'core' | 'elective' | 'optional' | 'co_curricular' | 'language' */
    type: varchar('type', { length: 30 }).notNull().default('core'),
    /** Co-scholastic subjects don't count toward percentage. */
    isScholastic: boolean('is_scholastic').notNull().default(true),
    hasPractical: boolean('has_practical').notNull().default(false),

    isActive: isActive(),
    ...timestamps,
    ...syncable,
  },
  (t) => ({
    uq: uniqueIndex('subjects_uq').on(t.branchId, t.code),
  }),
);

/** Which subjects are taught to which class, with marks weightage. */
export const classSubjects = pgTable(
  'class_subjects',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    classId: uuid('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
    academicSessionId: uuid('academic_session_id')
      .notNull()
      .references(() => academicSessions.id, { onDelete: 'cascade' }),

    isCompulsory: boolean('is_compulsory').notNull().default(true),
    maxMarks: integer('max_marks').default(100),
    passMarks: integer('pass_marks').default(33),
    periodsPerWeek: smallint('periods_per_week'),
    sequence: smallint('sequence').default(0),

    ...timestamps,
    ...syncable,
  },
  (t) => ({
    uq: uniqueIndex('class_subjects_uq').on(t.classId, t.subjectId, t.academicSessionId),
  }),
);

// ---------------------------------------------------------------------------
// Timetable (B7)
// ---------------------------------------------------------------------------

/** Named period slots: P1 08:00-08:40, Break, P2 ... */
export const periods = pgTable(
  'periods',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 30 }).notNull(),
    sequence: smallint('sequence').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    isBreak: boolean('is_break').notNull().default(false),
    /** Attendance is taken in this period (usually P1 + post-lunch). */
    isAttendancePeriod: boolean('is_attendance_period').notNull().default(false),

    ...timestamps,
    ...syncable,
  },
  (t) => ({
    uq: uniqueIndex('periods_uq').on(t.branchId, t.sequence),
  }),
);

export const timetableSlots = pgTable(
  'timetable_slots',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
    academicSessionId: uuid('academic_session_id')
      .notNull()
      .references(() => academicSessions.id, { onDelete: 'cascade' }),

    sectionId: uuid('section_id').notNull().references(() => sections.id, { onDelete: 'cascade' }),
    periodId: uuid('period_id').notNull().references(() => periods.id, { onDelete: 'cascade' }),
    /** 1 = Monday ... 7 = Sunday (ISO). */
    weekday: smallint('weekday').notNull(),

    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
    /** FK to staff added in 06-staff. */
    staffId: uuid('staff_id'),
    roomNo: varchar('room_no', { length: 30 }),

    /** Effective-dated so mid-year timetable changes don't rewrite history. */
    effectiveFrom: date('effective_from'),
    effectiveTo: date('effective_to'),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    sectionDayIdx: index('tt_section_day_idx').on(t.sectionId, t.weekday),
    staffDayIdx: index('tt_staff_day_idx').on(t.staffId, t.weekday),
    uq: uniqueIndex('tt_slot_uq').on(t.sectionId, t.periodId, t.weekday, t.effectiveFrom),
  }),
);

/** B6 — Substitution when a teacher is absent. */
export const substitutions = pgTable(
  'substitutions',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),

    day: date('day').notNull(),
    timetableSlotId: uuid('timetable_slot_id').references(() => timetableSlots.id, {
      onDelete: 'cascade',
    }),
    absentStaffId: uuid('absent_staff_id'),
    substituteStaffId: uuid('substitute_staff_id'),

    reason: text('reason'),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    dayIdx: index('substitutions_day_idx').on(t.tenantId, t.day),
  }),
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const academicSessionsRelations = relations(academicSessions, ({ many }) => ({
  terms: many(terms),
  sections: many(sections),
}));

export const classesRelations = relations(classes, ({ many, one }) => ({
  sections: many(sections),
  branch: one(branches, { fields: [classes.branchId], references: [branches.id] }),
}));

export const sectionsRelations = relations(sections, ({ one }) => ({
  class: one(classes, { fields: [sections.classId], references: [classes.id] }),
  session: one(academicSessions, {
    fields: [sections.academicSessionId],
    references: [academicSessions.id],
  }),
}));

/**
 * Modules B3 / B4 — Attendance. THE highest-leverage screen in the product.
 *
 * Target: a class teacher marks 40 students in under 20 seconds, offline.
 *
 * DESIGN NOTES
 * ------------
 * - `attendance_registers` is the header (one per section per day per period).
 *   Creating it explicitly gives us "who marked it and when", plus a cheap way
 *   to answer "which classes haven't marked attendance yet today" — which is
 *   the principal's #1 dashboard widget.
 *
 * - `student_attendance` stores ONLY exceptions by default? No — we store every
 *   student. Storing only absentees looks clever and saves rows, but it makes
 *   "was this actually marked, or just not marked?" ambiguous, and that
 *   ambiguity is a safety problem when a parent asks where their child is.
 *   40 students x 200 days x 800 students is ~6M rows/year/school — trivial
 *   for Postgres with correct indexes.
 *
 * - `client_mutation_id` gives us idempotent offline replay: the app generates
 *   a UUID per mutation, retries safely, and the server dedupes.
 */

import { relations } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  actorstamps,
  attendanceStatusEnum,
  pk,
  syncable,
  timestamps,
} from './_common';
import { branches, tenants } from './01-tenancy';
import { users } from './02-identity';
import { academicSessions, periods, sections, subjects } from './04-academic';
import { staff } from './06-staff';
import { studentEnrollments, students } from './05-students';

export const attendanceModeEnum = pgEnum('attendance_mode', [
  'daily',
  'period',
  'biometric',
  'rfid',
  'gate_scan',
]);

// ---------------------------------------------------------------------------
// Register header
// ---------------------------------------------------------------------------

export const attendanceRegisters = pgTable(
  'attendance_registers',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
    academicSessionId: uuid('academic_session_id')
      .notNull()
      .references(() => academicSessions.id, { onDelete: 'cascade' }),

    sectionId: uuid('section_id').notNull().references(() => sections.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    /** Null for daily-mode attendance. */
    periodId: uuid('period_id').references(() => periods.id, { onDelete: 'set null' }),
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'set null' }),

    mode: attendanceModeEnum('mode').notNull().default('daily'),

    markedByStaffId: uuid('marked_by_staff_id').references(() => staff.id),
    markedAt: timestamp('marked_at', { withTimezone: true }),
    /** Locked registers can only be changed by an admin, and it's audited. */
    isLocked: boolean('is_locked').notNull().default(false),

    presentCount: smallint('present_count').notNull().default(0),
    absentCount: smallint('absent_count').notNull().default(0),
    totalCount: smallint('total_count').notNull().default(0),

    /** Set by the offline client; server dedupes replays on this. */
    clientMutationId: uuid('client_mutation_id'),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    /**
     * NULLS NOT DISTINCT — period_id IS NULL means "daily-mode register for
     * this section on this day". Under the default (NULLS DISTINCT) two such
     * rows did not collide, so a section could end up with two day-level
     * registers for the same day. That is the "was this actually marked, or
     * just not marked?" ambiguity one level up: which of the two is the real
     * register? A parent asking where their child is cannot get a reliable
     * answer when the table itself has two.
     */
    uq: unique('att_register_uq').on(t.sectionId, t.day, t.periodId).nullsNotDistinct(),
    dayIdx: index('att_register_day_idx').on(t.tenantId, t.day),
    branchDayIdx: index('att_register_branch_day_idx').on(t.branchId, t.day),
    unmarkedIdx: index('att_register_unmarked_idx').on(t.branchId, t.day, t.markedAt),
    clientMutUq: uniqueIndex('att_register_client_mut_uq').on(t.clientMutationId),
  }),
);

// ---------------------------------------------------------------------------
// Student attendance rows
// ---------------------------------------------------------------------------

export const studentAttendance = pgTable(
  'student_attendance',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    registerId: uuid('register_id')
      .notNull()
      .references(() => attendanceRegisters.id, { onDelete: 'cascade' }),

    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    enrollmentId: uuid('enrollment_id').references(() => studentEnrollments.id, {
      onDelete: 'cascade',
    }),

    /** Denormalised for fast range queries without joining the register. */
    day: date('day').notNull(),
    sectionId: uuid('section_id').notNull(),

    status: attendanceStatusEnum('status').notNull().default('not_marked'),
    inTime: time('in_time'),
    outTime: time('out_time'),
    remarks: varchar('remarks', { length: 200 }),

    /** Links to an approved leave request, if any. */
    leaveRequestId: uuid('leave_request_id'),

    /** Parent notification state — drives the auto-absentee alert. */
    parentNotifiedAt: timestamp('parent_notified_at', { withTimezone: true }),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    uq: uniqueIndex('student_attendance_uq').on(t.registerId, t.studentId),
    studentDayIdx: index('student_attendance_student_day_idx').on(t.studentId, t.day),
    sectionDayIdx: index('student_attendance_section_day_idx').on(t.sectionId, t.day),
    statusIdx: index('student_attendance_status_idx').on(t.tenantId, t.day, t.status),
    notifyIdx: index('student_attendance_notify_idx').on(t.day, t.status, t.parentNotifiedAt),
  }),
);

/**
 * Rolling per-student summary, maintained by trigger/job.
 * Exists so the parent app's home screen ("92% this term") is a single
 * indexed row read instead of a COUNT over the year. On a 2-core box this
 * distinction matters.
 */
export const attendanceSummaries = pgTable(
  'attendance_summaries',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    academicSessionId: uuid('academic_session_id')
      .notNull()
      .references(() => academicSessions.id, { onDelete: 'cascade' }),
    termId: uuid('term_id'),

    workingDays: integer('working_days').notNull().default(0),
    presentDays: integer('present_days').notNull().default(0),
    absentDays: integer('absent_days').notNull().default(0),
    lateDays: integer('late_days').notNull().default(0),
    leaveDays: integer('leave_days').notNull().default(0),
    /** Basis points: 9250 = 92.50%. */
    percentageBp: integer('percentage_bp').notNull().default(0),

    lastComputedAt: timestamp('last_computed_at', { withTimezone: true }),

    ...timestamps,
    ...syncable,
  },
  (t) => ({
    /**
     * NULLS NOT DISTINCT — term_id IS NULL means "whole-session summary".
     * Without it, two session-level summaries for the same student would
     * both be admitted, and the percentage a parent sees becomes whichever
     * row the query happens to pick.
     */
    uq: unique('att_summary_uq')
      .on(t.studentId, t.academicSessionId, t.termId)
      .nullsNotDistinct(),
    sessionIdx: index('att_summary_session_idx').on(t.academicSessionId),
  }),
);

// ---------------------------------------------------------------------------
// Staff attendance (B4)
// ---------------------------------------------------------------------------

export const staffAttendance = pgTable(
  'staff_attendance',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
    staffId: uuid('staff_id').notNull().references(() => staff.id, { onDelete: 'cascade' }),

    day: date('day').notNull(),
    status: attendanceStatusEnum('status').notNull().default('not_marked'),
    inTime: time('in_time'),
    outTime: time('out_time'),
    workedMinutes: integer('worked_minutes'),

    mode: attendanceModeEnum('mode').notNull().default('daily'),
    /** For geo-fenced mobile check-in. */
    checkInLat: varchar('check_in_lat', { length: 20 }),
    checkInLng: varchar('check_in_lng', { length: 20 }),
    deviceRef: varchar('device_ref', { length: 100 }),

    leaveRequestId: uuid('leave_request_id'),
    remarks: varchar('remarks', { length: 200 }),

    markedByUserId: uuid('marked_by_user_id').references(() => users.id),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    uq: uniqueIndex('staff_attendance_uq').on(t.staffId, t.day),
    branchDayIdx: index('staff_attendance_branch_day_idx').on(t.branchId, t.day),
  }),
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const attendanceRegistersRelations = relations(
  attendanceRegisters,
  ({ many, one }) => ({
    entries: many(studentAttendance),
    section: one(sections, {
      fields: [attendanceRegisters.sectionId],
      references: [sections.id],
    }),
    markedBy: one(staff, {
      fields: [attendanceRegisters.markedByStaffId],
      references: [staff.id],
    }),
  }),
);

export const studentAttendanceRelations = relations(studentAttendance, ({ one }) => ({
  register: one(attendanceRegisters, {
    fields: [studentAttendance.registerId],
    references: [attendanceRegisters.id],
  }),
  student: one(students, {
    fields: [studentAttendance.studentId],
    references: [students.id],
  }),
}));

/**
 * Module B31 — Digital Book Library  (your request #7)
 * Module B15 — Physical library (issue/return)
 *
 * YOUR DESIGN, ENCODED
 * --------------------
 * "School uploads the book -> student opens it -> it is stored locally on the
 *  phone and opened from there -> if anything changed they press Sync."
 *
 * That download-once-read-forever model is exactly right for a 2-core free VM,
 * because a PDF served repeatedly is the fastest way to exhaust a 10 Mbps load
 * balancer. The schema supports it with THREE pieces:
 *
 *   1. book_files.version + content_hash
 *      The client stores the version it downloaded. Sync compares versions.
 *      content_hash (SHA-256) lets the client verify the file and lets the
 *      server answer "unchanged" with a 60-byte response instead of 30 MB.
 *
 *   2. book_files.file_path + byte_size
 *      Served as a signed, time-limited URL straight off the block volume via
 *      Caddy, with Range-request support so an interrupted download resumes
 *      instead of restarting.
 *
 *   3. student_book_downloads
 *      Server-side record of who holds which version offline. This is what
 *      powers "3 of 40 students are on an outdated version" and, more
 *      importantly, lets us push a sync nudge to ONLY those 3 devices instead
 *      of broadcasting to all 40.
 *
 * See docs/04-sync-architecture.md for the generalised click-to-sync protocol
 * you asked to apply across the product.
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
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  actorstamps,
  isActive,
  paise,
  pk,
  syncable,
  timestamps,
} from './_common';
import { branches, tenants } from './01-tenancy';
import { users } from './02-identity';
import { academicSessions, classes, sections, subjects } from './04-academic';
import { staff } from './06-staff';
import { students } from './05-students';

export const bookSourceEnum = pgEnum('book_source', [
  'school_upload',   // uploaded by the school — the default per your decision
  'external_link',   // NCERT / state board / publisher URL, zero storage cost
  'purchased',
]);

export const bookStatusEnum = pgEnum('book_status', [
  'draft', 'processing', 'published', 'archived', 'takedown',
]);

// ---------------------------------------------------------------------------
// Digital books
// ---------------------------------------------------------------------------

export const books = pgTable(
  'books',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),

    title: varchar('title', { length: 250 }).notNull(),
    subtitle: varchar('subtitle', { length: 250 }),
    author: varchar('author', { length: 200 }),
    publisher: varchar('publisher', { length: 200 }),
    isbn: varchar('isbn', { length: 20 }),
    edition: varchar('edition', { length: 50 }),
    language: varchar('language', { length: 30 }).default('en'),

    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
    /** 'textbook' | 'workbook' | 'reference' | 'notes' | 'question_bank' | 'worksheet' */
    bookType: varchar('book_type', { length: 40 }).notNull().default('textbook'),

    source: bookSourceEnum('source').notNull().default('school_upload'),
    /** Set only when source = external_link. Costs us zero storage. */
    externalUrl: text('external_url'),

    coverPath: text('cover_path'),
    description: text('description'),

    status: bookStatusEnum('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),

    /**
     * COPYRIGHT. The uploading school accepts responsibility that it holds
     * distribution rights. We record who accepted and when, and expose a
     * takedown path. Do not ship uploads without this.
     */
    copyrightAcceptedByUserId: uuid('copyright_accepted_by_user_id').references(() => users.id),
    copyrightAcceptedAt: timestamp('copyright_accepted_at', { withTimezone: true }),
    takedownReason: text('takedown_reason'),

    /** Denormalised counters for the librarian view. */
    totalDownloads: integer('total_downloads').notNull().default(0),
    uniqueReaders: integer('unique_readers').notNull().default(0),

    uploadedByStaffId: uuid('uploaded_by_staff_id').references(() => staff.id),

    isActive: isActive(),
    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    branchIdx: index('books_branch_idx').on(t.branchId, t.status),
    subjectIdx: index('books_subject_idx').on(t.subjectId),
    titleIdx: index('books_title_idx').on(t.title),
  }),
);

/**
 * The actual file. Separate from `books` because a book can be re-uploaded
 * (corrected edition) and because large textbooks are often split into
 * per-chapter PDFs — which is strongly preferable on a 10 Mbps link.
 */
export const bookFiles = pgTable(
  'book_files',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    bookId: uuid('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),

    /** Chapter/part label. Null for a single-file book. */
    partLabel: varchar('part_label', { length: 100 }),
    partSequence: smallint('part_sequence').default(0),

    /** Storage-adapter key, e.g. t/{tenant}/books/{book}/v3/ch01.pdf */
    filePath: text('file_path').notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull().default('application/pdf'),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    pageCount: integer('page_count'),

    /**
     * SYNC CONTRACT — the two columns the client cares about.
     * version increments on every re-upload. contentHash is SHA-256 of the
     * bytes; the client sends it and gets 304-equivalent when unchanged.
     */
    version: integer('version').notNull().default(1),
    contentHash: varchar('content_hash', { length: 64 }).notNull(),

    /** Set when a new version supersedes this one; kept for rollback. */
    supersededAt: timestamp('superseded_at', { withTimezone: true }),

    isActive: isActive(),
    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    bookIdx: index('book_files_book_idx').on(t.bookId, t.partSequence),
    hashIdx: index('book_files_hash_idx').on(t.contentHash),
    uq: uniqueIndex('book_files_uq').on(t.bookId, t.partSequence, t.version),
  }),
);

/** Who can see which book. A book with no mapping is visible to nobody. */
export const bookAudiences = pgTable(
  'book_audiences',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    bookId: uuid('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
    academicSessionId: uuid('academic_session_id')
      .notNull()
      .references(() => academicSessions.id, { onDelete: 'cascade' }),

    /** Class-wide, or narrowed to a section. */
    classId: uuid('class_id').references(() => classes.id, { onDelete: 'cascade' }),
    sectionId: uuid('section_id').references(() => sections.id, { onDelete: 'cascade' }),

    /** Optional window — e.g. a question bank released only before exams. */
    availableFrom: timestamp('available_from', { withTimezone: true }),
    availableTo: timestamp('available_to', { withTimezone: true }),

    ...timestamps,
  },
  (t) => ({
    /**
     * NULLS NOT DISTINCT — class_id / section_id NULL means "all classes /
     * all sections". Without it two "whole-school" audience rows for the same
     * book and session both survive, and download eligibility becomes a race.
     */
    uq: unique('book_audiences_uq')
      .on(t.bookId, t.classId, t.sectionId, t.academicSessionId)
      .nullsNotDistinct(),
    classIdx: index('book_audiences_class_idx').on(t.classId),
    sectionIdx: index('book_audiences_section_idx').on(t.sectionId),
  }),
);

/**
 * Offline holdings. One row per (student, book_file) they have downloaded.
 * Drives the targeted "your copy is outdated, tap Sync" nudge.
 */
export const studentBookDownloads = pgTable(
  'student_book_downloads',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    bookFileId: uuid('book_file_id')
      .notNull()
      .references(() => bookFiles.id, { onDelete: 'cascade' }),

    /** The version sitting on the phone right now. */
    downloadedVersion: integer('downloaded_version').notNull(),
    downloadedHash: varchar('downloaded_hash', { length: 64 }),
    downloadedAt: timestamp('downloaded_at', { withTimezone: true }).defaultNow(),

    deviceId: varchar('device_id', { length: 100 }),

    /** Reading position — restored when they reopen. */
    lastPage: integer('last_page').default(1),
    lastOpenedAt: timestamp('last_opened_at', { withTimezone: true }),
    /** Bookmarks & highlights, synced with the same click-to-sync protocol. */
    bookmarks: jsonb('bookmarks').$type<Record<string, unknown>[]>().default([]),

    /**
     * TRUE when server version > downloadedVersion. Maintained by the
     * re-upload job so the "needs sync" query is an index lookup, not a join.
     */
    needsSync: boolean('needs_sync').notNull().default(false),
    syncNudgedAt: timestamp('sync_nudged_at', { withTimezone: true }),

    deletedFromDeviceAt: timestamp('deleted_from_device_at', { withTimezone: true }),

    ...timestamps,
    ...syncable,
  },
  (t) => ({
    uq: uniqueIndex('sbd_uq').on(t.studentId, t.bookFileId, t.deviceId),
    studentIdx: index('sbd_student_idx').on(t.studentId),
    /** The targeted-nudge index. */
    needsSyncIdx: index('sbd_needs_sync_idx').on(t.tenantId, t.needsSync),
  }),
);

// ---------------------------------------------------------------------------
// B15 — Physical library
// ---------------------------------------------------------------------------

export const libraryItems = pgTable(
  'library_items',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),

    accessionNo: varchar('accession_no', { length: 40 }).notNull(),
    barcode: varchar('barcode', { length: 60 }),
    title: varchar('title', { length: 250 }).notNull(),
    author: varchar('author', { length: 200 }),
    publisher: varchar('publisher', { length: 200 }),
    isbn: varchar('isbn', { length: 20 }),
    callNumber: varchar('call_number', { length: 40 }),
    category: varchar('category', { length: 60 }),

    /** Optional link to the digital edition. */
    digitalBookId: uuid('digital_book_id').references(() => books.id, { onDelete: 'set null' }),

    totalCopies: smallint('total_copies').notNull().default(1),
    availableCopies: smallint('available_copies').notNull().default(1),
    shelfLocation: varchar('shelf_location', { length: 60 }),
    pricePaise: paise('price_paise'),
    acquiredOn: date('acquired_on'),

    isActive: isActive(),
    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    accessionUq: uniqueIndex('library_items_accession_uq').on(t.branchId, t.accessionNo),
    barcodeIdx: index('library_items_barcode_idx').on(t.barcode),
    titleIdx: index('library_items_title_idx').on(t.title),
  }),
);

export const libraryLoans = pgTable(
  'library_loans',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id').notNull().references(() => libraryItems.id, { onDelete: 'cascade' }),

    /** Exactly one borrower. */
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    staffId: uuid('staff_id').references(() => staff.id, { onDelete: 'cascade' }),

    issuedOn: date('issued_on').notNull(),
    dueOn: date('due_on').notNull(),
    returnedOn: date('returned_on'),
    renewCount: smallint('renew_count').notNull().default(0),

    finePaise: paise('fine_paise').default(0),
    fineWaivedPaise: paise('fine_waived_paise').default(0),
    finePaidAt: timestamp('fine_paid_at', { withTimezone: true }),

    /** 'good' | 'damaged' | 'lost' */
    conditionOnReturn: varchar('condition_on_return', { length: 20 }),

    issuedByUserId: uuid('issued_by_user_id').references(() => users.id),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    itemIdx: index('library_loans_item_idx').on(t.itemId),
    studentIdx: index('library_loans_student_idx').on(t.studentId),
    /** Overdue list. */
    overdueIdx: index('library_loans_overdue_idx').on(t.tenantId, t.dueOn, t.returnedOn),
  }),
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const booksRelations = relations(books, ({ many, one }) => ({
  files: many(bookFiles),
  audiences: many(bookAudiences),
  subject: one(subjects, { fields: [books.subjectId], references: [subjects.id] }),
}));

export const bookFilesRelations = relations(bookFiles, ({ many, one }) => ({
  book: one(books, { fields: [bookFiles.bookId], references: [books.id] }),
  downloads: many(studentBookDownloads),
}));

export const studentBookDownloadsRelations = relations(studentBookDownloads, ({ one }) => ({
  bookFile: one(bookFiles, {
    fields: [studentBookDownloads.bookFileId],
    references: [bookFiles.id],
  }),
  student: one(students, {
    fields: [studentBookDownloads.studentId],
    references: [students.id],
  }),
}));

export const libraryItemsRelations = relations(libraryItems, ({ many }) => ({
  loans: many(libraryLoans),
}));

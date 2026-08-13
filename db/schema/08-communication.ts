/**
 * Modules A6 / F3 / B28 — Communication. THE MODULE THAT REPLACES WHATSAPP.
 *
 * The product promises three things WhatsApp cannot do, and the schema has to
 * make all three cheap:
 *
 * 1. READ RECEIPTS  -> message_recipients.read_at
 * 2. NUMBER MASKING -> teachers and parents talk via thread ids; no phone
 *                      number is ever exposed on either side.
 * 3. QUIET HOURS    -> scheduled_for + tenant setting; nothing pushes at 11 PM.
 *
 * COST CONTROL: SMS is the sneaky variable cost (~₹9,600/mo at 10 schools if
 * you fan out carelessly). `delivery_attempts` implements a fallback LADDER:
 * push first, and only escalate to SMS/WhatsApp when push is undelivered or
 * unread after N minutes AND the message is marked critical.
 */

import { relations } from 'drizzle-orm';
import {
  boolean,
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
  isActive,
  languageEnum,
  pk,
  syncable,
  timestamps,
} from './_common';
import { branches, tenants } from './01-tenancy';
import { users } from './02-identity';

export const channelEnum = pgEnum('channel', ['push', 'in_app', 'sms', 'whatsapp', 'email']);

export const deliveryStatusEnum = pgEnum('delivery_status', [
  'queued', 'sent', 'delivered', 'read', 'failed', 'skipped', 'suppressed',
]);

export const announcementTypeEnum = pgEnum('announcement_type', [
  'circular', 'notice', 'event', 'holiday', 'emergency',
  'fee_reminder', 'exam', 'ptm', 'achievement', 'general',
]);

export const audienceTypeEnum = pgEnum('audience_type', [
  'all', 'all_parents', 'all_staff', 'all_students',
  'class', 'section', 'role', 'individual', 'transport_route', 'custom_list',
]);

export const priorityEnum = pgEnum('priority', ['low', 'normal', 'high', 'critical']);

// ---------------------------------------------------------------------------
// Announcements / circulars — one-way broadcast
// ---------------------------------------------------------------------------

export const announcements = pgTable(
  'announcements',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'cascade' }),

    type: announcementTypeEnum('type').notNull().default('general'),
    priority: priorityEnum('priority').notNull().default('normal'),

    title: varchar('title', { length: 200 }).notNull(),
    body: text('body').notNull(),
    /** Auto/manual translations keyed by language: { hi: {title, body} }. */
    translations: jsonb('translations').$type<Record<string, { title: string; body: string }>>(),

    attachmentPaths: jsonb('attachment_paths').$type<string[]>().default([]),

    audienceType: audienceTypeEnum('audience_type').notNull().default('all_parents'),
    /** { sectionIds: [], classIds: [], roleIds: [], userIds: [] } */
    audienceRefs: jsonb('audience_refs').$type<Record<string, string[]>>().default({}),

    /** Which channels to use. Push is always included. */
    channels: jsonb('channels').$type<string[]>().notNull().default(['push', 'in_app']),

    /** Circulars from a teacher may need principal approval before going out. */
    status: approvalStatusEnum('status').notNull().default('draft'),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),

    /** Respects quiet hours; the scheduler will not send before this. */
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),

    /** Denormalised counters for the "who read it" widget. */
    recipientCount: integer('recipient_count').notNull().default(0),
    deliveredCount: integer('delivered_count').notNull().default(0),
    readCount: integer('read_count').notNull().default(0),

    /** Forces an acknowledgement tap from the parent. */
    requiresAcknowledgement: boolean('requires_acknowledgement').notNull().default(false),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    tenantIdx: index('announcements_tenant_idx').on(t.tenantId, t.createdAt),
    statusIdx: index('announcements_status_idx').on(t.tenantId, t.status),
    scheduleIdx: index('announcements_schedule_idx').on(t.scheduledFor, t.sentAt),
  }),
);

// ---------------------------------------------------------------------------
// Threads — two-way, masked parent<->teacher messaging
// ---------------------------------------------------------------------------

export const messageThreads = pgTable(
  'message_threads',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),

    subject: varchar('subject', { length: 200 }),
    /** Thread is usually about a specific child. */
    studentId: uuid('student_id'),
    /** 'parent_teacher' | 'staff_internal' | 'support' */
    threadType: varchar('thread_type', { length: 30 }).notNull().default('parent_teacher'),

    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    isClosed: boolean('is_closed').notNull().default(false),
    closedAt: timestamp('closed_at', { withTimezone: true }),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    tenantIdx: index('threads_tenant_idx').on(t.tenantId, t.lastMessageAt),
    studentIdx: index('threads_student_idx').on(t.studentId),
  }),
);

export const threadParticipants = pgTable(
  'thread_participants',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => messageThreads.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

    /** Display name shown to the OTHER side. Masking happens here. */
    displayAs: varchar('display_as', { length: 100 }),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
    isMuted: boolean('is_muted').notNull().default(false),
    leftAt: timestamp('left_at', { withTimezone: true }),

    ...timestamps,
  },
  (t) => ({
    uq: uniqueIndex('thread_participants_uq').on(t.threadId, t.userId),
    userIdx: index('thread_participants_user_idx').on(t.userId),
  }),
);

export const messages = pgTable(
  'messages',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => messageThreads.id, { onDelete: 'cascade' }),
    senderUserId: uuid('sender_user_id').notNull().references(() => users.id),

    body: text('body').notNull(),
    attachmentPaths: jsonb('attachment_paths').$type<string[]>().default([]),

    /** Offline send dedupe. */
    clientMutationId: uuid('client_mutation_id'),

    editedAt: timestamp('edited_at', { withTimezone: true }),
    ...timestamps,
    ...syncable,
  },
  (t) => ({
    threadIdx: index('messages_thread_idx').on(t.threadId, t.createdAt),
    clientMutUq: uniqueIndex('messages_client_mut_uq').on(t.clientMutationId),
  }),
);

// ---------------------------------------------------------------------------
// Delivery ledger — the read-receipt + cost-control engine
// ---------------------------------------------------------------------------

export const notificationTemplates = pgTable(
  'notification_templates',
  {
    id: pk(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),

    code: varchar('code', { length: 60 }).notNull(),
    channel: channelEnum('channel').notNull(),
    language: languageEnum('language').notNull().default('en'),

    subject: varchar('subject', { length: 200 }),
    body: text('body').notNull(),
    /** TRAI DLT template id — REQUIRED for transactional SMS in India. */
    dltTemplateId: varchar('dlt_template_id', { length: 40 }),
    dltEntityId: varchar('dlt_entity_id', { length: 40 }),

    variables: jsonb('variables').$type<string[]>().default([]),
    isActive: isActive(),
    ...timestamps,
  },
  (t) => ({
    /**
     * NULLS NOT DISTINCT — system templates have tenant_id = NULL, and under
     * the default NULLS DISTINCT this index let every seed run insert another
     * copy. Eleven copies of each template accumulated locally and the
     * dispatcher kept serving the oldest, so wording fixes never shipped.
     */
    uq: unique('notif_templates_uq')
      .on(t.tenantId, t.code, t.channel, t.language)
      .nullsNotDistinct(),
  }),
);

/**
 * One row per (message, recipient). This is the biggest table in the system.
 * Partition by month once it passes ~50M rows.
 */
export const deliveryAttempts = pgTable(
  'delivery_attempts',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),

    /** Exactly one source is set. */
    announcementId: uuid('announcement_id').references(() => announcements.id, {
      onDelete: 'cascade',
    }),
    messageId: uuid('message_id').references(() => messages.id, { onDelete: 'cascade' }),
    /** System notifications (fee due, absent alert) reference a template only. */
    templateCode: varchar('template_code', { length: 60 }),

    recipientUserId: uuid('recipient_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    channel: channelEnum('channel').notNull(),
    status: deliveryStatusEnum('status').notNull().default('queued'),
    priority: priorityEnum('priority').notNull().default('normal'),

    /**
     * FALLBACK LADDER. attempt 0 = push. If not read within the escalation
     * window and priority >= high, attempt 1 = SMS/WhatsApp. `suppressed`
     * means the ladder stopped because the user already read it — which is
     * the SMS bill we just avoided.
     */
    attemptNo: smallint('attempt_no').notNull().default(0),
    escalatedFromId: uuid('escalated_from_id'),

    providerRef: varchar('provider_ref', { length: 120 }),
    providerName: varchar('provider_name', { length: 40 }),
    /** Template variables at send time — needed to render in_app inbox rows. */
    variables: jsonb('variables').$type<Record<string, string>>(),
    /** Paise. Lets us show a school its own comms spend. */
    costPaise: integer('cost_paise').default(0),

    queuedAt: timestamp('queued_at', { withTimezone: true }).defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    failureReason: text('failure_reason'),

    ...timestamps,
  },
  (t) => ({
    recipientIdx: index('delivery_recipient_idx').on(t.recipientUserId, t.createdAt),
    announcementIdx: index('delivery_announcement_idx').on(t.announcementId),
    statusIdx: index('delivery_status_idx').on(t.status, t.channel),
    escalationIdx: index('delivery_escalation_idx').on(t.status, t.priority, t.sentAt),
    tenantCostIdx: index('delivery_tenant_cost_idx').on(t.tenantId, t.createdAt),
  }),
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const messageThreadsRelations = relations(messageThreads, ({ many }) => ({
  participants: many(threadParticipants),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  thread: one(messageThreads, {
    fields: [messages.threadId],
    references: [messageThreads.id],
  }),
  sender: one(users, { fields: [messages.senderUserId], references: [users.id] }),
}));

export const announcementsRelations = relations(announcements, ({ many }) => ({
  deliveries: many(deliveryAttempts),
}));

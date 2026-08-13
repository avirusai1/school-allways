/**
 * Modules C1–C4, C9 — Fees. The revenue engine, and the accountant's daily pain.
 *
 * ALL MONEY IS INTEGER PAISE. Never float. ₹1,250.50 => 125050.
 *
 * THE THREE HARD PARTS, and how the schema handles each
 * -----------------------------------------------------
 * 1. STRUCTURE COMPLEXITY. Class-wise x term-wise x head-wise, plus sibling /
 *    staff-ward / RTE / SC-ST / merit concessions, transport slabs and late-fee
 *    slabs. Solved by: fee_structures (versioned, effective-dated) ->
 *    fee_structure_items (one row per head x term) -> concession rules applied
 *    at invoice generation, with every applied concession recorded as a row.
 *
 * 2. RECONCILIATION. Cash + cheque + UPI + gateway + bank transfer, matched at
 *    month end. Solved by: payments (what the parent did) is SEPARATE from
 *    payment_allocations (which invoice lines it settled) and from
 *    settlement_records (what actually landed in the bank). Most competitors
 *    conflate all three, which is precisely why their reconciliation is
 *    unusable.
 *
 * 3. VERSIONING FOR FEE-REGULATION ACTS. Several states require documented
 *    approval of any hike. fee_structures are immutable once active; a change
 *    creates a new version with its own approval trail.
 */

import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
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
  basisPoints,
  isActive,
  paise,
  pk,
  syncable,
  timestamps,
} from './_common';
import { branches, tenants } from './01-tenancy';
import { users } from './02-identity';
import { academicSessions, classes, terms } from './04-academic';
import { students } from './05-students';

export const feeFrequencyEnum = pgEnum('fee_frequency', [
  'one_time', 'monthly', 'quarterly', 'term', 'half_yearly', 'annual',
]);

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft', 'issued', 'partially_paid', 'paid', 'overdue', 'waived', 'cancelled',
]);

export const paymentModeEnum = pgEnum('payment_mode', [
  'cash', 'cheque', 'dd', 'upi', 'card', 'netbanking', 'wallet',
  'bank_transfer', 'adjustment', 'waiver',
]);

export const paymentStatusEnum = pgEnum('payment_status', [
  'initiated', 'pending', 'success', 'failed', 'refunded',
  'partially_refunded', 'bounced', 'cancelled',
]);

export const concessionTypeEnum = pgEnum('concession_type', [
  'sibling', 'staff_ward', 'rte', 'sc_st', 'ews', 'merit', 'sports',
  'single_parent', 'financial_aid', 'management', 'other',
]);

// ---------------------------------------------------------------------------
// Fee heads & structures
// ---------------------------------------------------------------------------

export const feeHeads = pgTable(
  'fee_heads',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),

    code: varchar('code', { length: 30 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    /** 'tuition' | 'transport' | 'exam' | 'lab' | 'admission' | 'eca' | ... */
    category: varchar('category', { length: 40 }).notNull().default('tuition'),

    /** Optional heads (transport, meals) are only billed if the student opts in. */
    isOptional: boolean('is_optional').notNull().default(false),
    isRefundable: boolean('is_refundable').notNull().default(false),
    /** Concessions never apply to some heads (e.g. exam board fee). */
    allowsConcession: boolean('allows_concession').notNull().default(true),
    /** Ledger account code for the Tally export (C5). */
    ledgerCode: varchar('ledger_code', { length: 40 }),

    sequence: smallint('sequence').default(0),
    isActive: isActive(),
    ...timestamps,
    ...syncable,
  },
  (t) => ({ uq: uniqueIndex('fee_heads_uq').on(t.branchId, t.code) }),
);

export const feeStructures = pgTable(
  'fee_structures',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
    academicSessionId: uuid('academic_session_id')
      .notNull()
      .references(() => academicSessions.id, { onDelete: 'cascade' }),
    classId: uuid('class_id').references(() => classes.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 120 }).notNull(),
    /** Immutable once approved. A change = version + 1. */
    version: smallint('version').notNull().default(1),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to'),

    /** Fee-regulation-act audit trail. */
    status: approvalStatusEnum('status').notNull().default('draft'),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    /** Percentage hike vs previous version, in basis points. For disclosure. */
    hikeOverPreviousBp: basisPoints('hike_over_previous_bp'),
    hikeJustification: text('hike_justification'),
    approvalDocumentPath: text('approval_document_path'),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    /**
     * NULLS NOT DISTINCT — class_id IS NULL means "branch-wide fee structure".
     * Without it two version-N structures for the same branch and session with
     * a NULL class both survive, and invoice generation can bill against the
     * wrong one.
     */
    uq: unique('fee_structures_uq')
      .on(t.branchId, t.academicSessionId, t.classId, t.version)
      .nullsNotDistinct(),
    activeIdx: index('fee_structures_active_idx').on(t.tenantId, t.status, t.effectiveFrom),
  }),
);

export const feeStructureItems = pgTable(
  'fee_structure_items',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    feeStructureId: uuid('fee_structure_id')
      .notNull()
      .references(() => feeStructures.id, { onDelete: 'cascade' }),
    feeHeadId: uuid('fee_head_id').notNull().references(() => feeHeads.id),
    termId: uuid('term_id').references(() => terms.id, { onDelete: 'cascade' }),

    amountPaise: paise('amount_paise').notNull(),
    frequency: feeFrequencyEnum('frequency').notNull().default('term'),
    dueDate: date('due_date'),

    /** Late fee: flat paise/day, or bp of the outstanding, capped. */
    lateFeePerDayPaise: paise('late_fee_per_day_paise').default(0),
    lateFeeMaxPaise: paise('late_fee_max_paise'),
    graceDays: smallint('grace_days').default(0),

    ...timestamps,
    ...syncable,
  },
  (t) => ({
    structureIdx: index('fsi_structure_idx').on(t.feeStructureId),
    /**
     * NULLS NOT DISTINCT — term_id IS NULL means "applies to every term".
     * Without it two annual-frequency items for the same head both survive.
     */
    uq: unique('fsi_uq')
      .on(t.feeStructureId, t.feeHeadId, t.termId)
      .nullsNotDistinct(),
  }),
);

// ---------------------------------------------------------------------------
// Concessions (C9) — every waiver is an auditable row
// ---------------------------------------------------------------------------

export const studentConcessions = pgTable(
  'student_concessions',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    academicSessionId: uuid('academic_session_id')
      .notNull()
      .references(() => academicSessions.id, { onDelete: 'cascade' }),

    type: concessionTypeEnum('type').notNull(),
    /** Restrict to one head, or null for all concession-eligible heads. */
    feeHeadId: uuid('fee_head_id').references(() => feeHeads.id, { onDelete: 'cascade' }),

    /** Exactly one of these two. */
    percentageBp: basisPoints('percentage_bp'),
    flatAmountPaise: paise('flat_amount_paise'),

    reason: text('reason'),
    documentPath: text('document_path'),

    status: approvalStatusEnum('status').notNull().default('pending'),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),

    validFrom: date('valid_from'),
    validTo: date('valid_to'),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    studentIdx: index('concessions_student_idx').on(t.studentId, t.academicSessionId),
    typeIdx: index('concessions_type_idx').on(t.tenantId, t.type),
    /**
     * The approvals tile counts these on every dashboard load. Partial, because
     * approved concessions accumulate for the life of the school while pending
     * ones are a working queue of a few dozen.
     */
    pendingIdx: index('concessions_pending_idx')
      .on(t.tenantId)
      .where(sql`${t.status} = 'pending'`),
  }),
);

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export const invoices = pgTable(
  'invoices',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    academicSessionId: uuid('academic_session_id')
      .notNull()
      .references(() => academicSessions.id, { onDelete: 'cascade' }),
    termId: uuid('term_id').references(() => terms.id),

    /** Gapless per branch per session — statutory expectation. */
    invoiceNo: varchar('invoice_no', { length: 40 }).notNull(),
    issueDate: date('issue_date').notNull(),
    dueDate: date('due_date').notNull(),

    grossAmountPaise: paise('gross_amount_paise').notNull().default(0),
    concessionAmountPaise: paise('concession_amount_paise').notNull().default(0),
    lateFeePaise: paise('late_fee_paise').notNull().default(0),
    adjustmentPaise: paise('adjustment_paise').notNull().default(0),
    netAmountPaise: paise('net_amount_paise').notNull().default(0),
    paidAmountPaise: paise('paid_amount_paise').notNull().default(0),
    /** Generated column in SQL: net - paid. Indexed for the defaulter list. */
    balancePaise: paise('balance_paise').notNull().default(0),

    status: invoiceStatusEnum('status').notNull().default('issued'),

    /** Ageing bucket, recomputed nightly: 0 | 30 | 60 | 90 | 120. */
    ageingBucket: smallint('ageing_bucket').default(0),

    notes: text('notes'),
    pdfPath: text('pdf_path'),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    invoiceNoUq: uniqueIndex('invoices_no_uq').on(t.branchId, t.invoiceNo),
    studentIdx: index('invoices_student_idx').on(t.studentId, t.academicSessionId),
    /** THE defaulter-list index. */
    balanceIdx: index('invoices_balance_idx').on(t.branchId, t.status, t.dueDate),
    ageingIdx: index('invoices_ageing_idx').on(t.tenantId, t.ageingBucket),
  }),
);

export const invoiceLines = pgTable(
  'invoice_lines',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
    feeHeadId: uuid('fee_head_id').notNull().references(() => feeHeads.id),

    description: varchar('description', { length: 200 }),
    grossAmountPaise: paise('gross_amount_paise').notNull(),
    concessionAmountPaise: paise('concession_amount_paise').notNull().default(0),
    netAmountPaise: paise('net_amount_paise').notNull(),
    paidAmountPaise: paise('paid_amount_paise').notNull().default(0),

    /** Which concession rows produced the discount — full audit chain. */
    appliedConcessionIds: jsonb('applied_concession_ids').$type<string[]>().default([]),

    sequence: smallint('sequence').default(0),
    ...timestamps,
    ...syncable,
  },
  (t) => ({ invoiceIdx: index('invoice_lines_invoice_idx').on(t.invoiceId) }),
);

// ---------------------------------------------------------------------------
// Payments — deliberately separate from allocation and from settlement
// ---------------------------------------------------------------------------

export const payments = pgTable(
  'payments',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),

    /** Gapless receipt number, issued only on success. */
    receiptNo: varchar('receipt_no', { length: 40 }),
    paymentDate: date('payment_date').notNull(),

    amountPaise: paise('amount_paise').notNull(),
    mode: paymentModeEnum('mode').notNull(),
    status: paymentStatusEnum('status').notNull().default('initiated'),

    // --- Instrument details ---
    /** Gateway order/payment id, UPI UTR, cheque no, DD no. */
    referenceNo: varchar('reference_no', { length: 100 }),
    bankName: varchar('bank_name', { length: 120 }),
    instrumentDate: date('instrument_date'),
    /** Cheque bounce tracking. */
    bouncedAt: timestamp('bounced_at', { withTimezone: true }),
    bounceCharges: paise('bounce_charges').default(0),

    // --- Gateway ---
    gatewayName: varchar('gateway_name', { length: 40 }),
    gatewayOrderId: varchar('gateway_order_id', { length: 100 }),
    gatewayPaymentId: varchar('gateway_payment_id', { length: 100 }),
    gatewayFeePaise: paise('gateway_fee_paise').default(0),
    gatewayResponse: jsonb('gateway_response').$type<Record<string, unknown>>(),

    /** Who took the money — cashier at counter, or the parent online. */
    collectedByUserId: uuid('collected_by_user_id').references(() => users.id),
    paidByUserId: uuid('paid_by_user_id').references(() => users.id),

    /** Set once matched to a bank statement line. NULL = unreconciled. */
    settlementId: uuid('settlement_id'),
    reconciledAt: timestamp('reconciled_at', { withTimezone: true }),

    receiptPath: text('receipt_path'),
    remarks: text('remarks'),
    clientMutationId: uuid('client_mutation_id'),

    ...timestamps,
    ...actorstamps,
    ...syncable,
  },
  (t) => ({
    receiptUq: uniqueIndex('payments_receipt_uq').on(t.branchId, t.receiptNo),
    studentIdx: index('payments_student_idx').on(t.studentId, t.paymentDate),
    dateIdx: index('payments_date_idx').on(t.branchId, t.paymentDate),
    /** THE reconciliation worklist index. */
    unreconciledIdx: index('payments_unreconciled_idx').on(
      t.branchId, t.status, t.reconciledAt,
    ),
    gatewayIdx: index('payments_gateway_idx').on(t.gatewayPaymentId),
    clientMutUq: uniqueIndex('payments_client_mut_uq').on(t.clientMutationId),
  }),
);

/** One payment can settle several invoice lines — and partial payments are normal. */
export const paymentAllocations = pgTable(
  'payment_allocations',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    paymentId: uuid('payment_id').notNull().references(() => payments.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
    invoiceLineId: uuid('invoice_line_id').references(() => invoiceLines.id, {
      onDelete: 'cascade',
    }),

    amountPaise: paise('amount_paise').notNull(),
    ...timestamps,
  },
  (t) => ({
    paymentIdx: index('payment_alloc_payment_idx').on(t.paymentId),
    invoiceIdx: index('payment_alloc_invoice_idx').on(t.invoiceId),
  }),
);

// ---------------------------------------------------------------------------
// Reconciliation (C3) — the flagship differentiator
// ---------------------------------------------------------------------------

/** A bank statement line, or a gateway settlement payout. */
export const settlements = pgTable(
  'settlements',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),

    /** 'bank_statement' | 'gateway_payout' | 'cash_deposit' */
    source: varchar('source', { length: 30 }).notNull(),
    sourceRef: varchar('source_ref', { length: 120 }),
    bankAccountId: uuid('bank_account_id'),

    valueDate: date('value_date').notNull(),
    grossAmountPaise: paise('gross_amount_paise').notNull(),
    feePaise: paise('fee_paise').default(0),
    taxPaise: paise('tax_paise').default(0),
    netAmountPaise: paise('net_amount_paise').notNull(),

    narration: text('narration'),

    /** How much of this settlement has been matched to payments. */
    matchedAmountPaise: paise('matched_amount_paise').notNull().default(0),
    /** 'unmatched' | 'partial' | 'matched' | 'exception' */
    matchStatus: varchar('match_status', { length: 20 }).notNull().default('unmatched'),
    exceptionReason: text('exception_reason'),

    reconciledByUserId: uuid('reconciled_by_user_id').references(() => users.id),
    reconciledAt: timestamp('reconciled_at', { withTimezone: true }),

    ...timestamps,
    ...actorstamps,
  },
  (t) => ({
    dateIdx: index('settlements_date_idx').on(t.branchId, t.valueDate),
    statusIdx: index('settlements_status_idx').on(t.tenantId, t.matchStatus),
  }),
);

/** End-of-day cash close at each collection counter. */
export const daybookEntries = pgTable(
  'daybook_entries',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),

    day: date('day').notNull(),
    counterName: varchar('counter_name', { length: 60 }),
    cashierUserId: uuid('cashier_user_id').references(() => users.id),

    openingCashPaise: paise('opening_cash_paise').notNull().default(0),
    cashCollectedPaise: paise('cash_collected_paise').notNull().default(0),
    chequeCollectedPaise: paise('cheque_collected_paise').notNull().default(0),
    onlineCollectedPaise: paise('online_collected_paise').notNull().default(0),
    cashDepositedPaise: paise('cash_deposited_paise').notNull().default(0),
    closingCashPaise: paise('closing_cash_paise').notNull().default(0),

    /** Counted minus expected. Non-zero = the thing the accountant hunts for. */
    variancePaise: paise('variance_paise').notNull().default(0),
    varianceNote: text('variance_note'),

    isClosed: boolean('is_closed').notNull().default(false),
    closedAt: timestamp('closed_at', { withTimezone: true }),

    ...timestamps,
    ...actorstamps,
  },
  (t) => ({
    uq: uniqueIndex('daybook_uq').on(t.branchId, t.day, t.counterName),
  }),
);

// ---------------------------------------------------------------------------
// C4 — Defaulter follow-up ladder
// ---------------------------------------------------------------------------

export const feeReminders = pgTable(
  'fee_reminders',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),

    /** 1 = gentle app nudge, 2 = WhatsApp, 3 = SMS, 4 = call list for office. */
    ladderStep: smallint('ladder_step').notNull().default(1),
    channel: varchar('channel', { length: 20 }),
    sentAt: timestamp('sent_at', { withTimezone: true }),

    /** Parent said "I'll pay by X" — tracked so the office stops chasing. */
    promiseToPayDate: date('promise_to_pay_date'),
    promiseKept: boolean('promise_kept'),

    outstandingAtSendPaise: paise('outstanding_at_send_paise'),
    notes: text('notes'),

    ...timestamps,
    ...actorstamps,
  },
  (t) => ({
    invoiceIdx: index('fee_reminders_invoice_idx').on(t.invoiceId),
    promiseIdx: index('fee_reminders_promise_idx').on(t.tenantId, t.promiseToPayDate),
  }),
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const invoicesRelations = relations(invoices, ({ many, one }) => ({
  lines: many(invoiceLines),
  allocations: many(paymentAllocations),
  student: one(students, { fields: [invoices.studentId], references: [students.id] }),
}));

export const paymentsRelations = relations(payments, ({ many, one }) => ({
  allocations: many(paymentAllocations),
  student: one(students, { fields: [payments.studentId], references: [students.id] }),
  settlement: one(settlements, {
    fields: [payments.settlementId],
    references: [settlements.id],
  }),
}));

export const feeStructuresRelations = relations(feeStructures, ({ many }) => ({
  items: many(feeStructureItems),
}));

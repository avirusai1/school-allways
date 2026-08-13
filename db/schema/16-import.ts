/**
 * Module A2 — Bulk import engine.
 *
 * Every row inserted during an import carries `import_batch_id` so a school
 * can undo the entire batch with one click. That undo promise is what makes
 * schools actually attempt migration instead of staying on WhatsApp groups.
 */

import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { actorstamps, pk, timestamps } from './_common';
import { branches, tenants } from './01-tenancy';
import { users } from './02-identity';

export const importEntityEnum = pgEnum('import_entity', ['students', 'staff']);
export const importStatusEnum = pgEnum('import_status', [
  'uploaded',
  'mapped',
  'validated',
  'committing',
  'committed',
  'failed',
  'undone',
]);

export const importBatches = pgTable(
  'import_batches',
  {
    id: pk(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'cascade' }),

    entity: importEntityEnum('entity').notNull(),
    status: importStatusEnum('status').notNull().default('uploaded'),
    vendor: varchar('vendor', { length: 30 }).notNull().default('generic'),

    filePath: text('file_path'),
    detectedColumns: jsonb('detected_columns').$type<string[]>().default([]),
    columnMapping: jsonb('column_mapping').$type<Record<string, string>>().default({}),
    validationResult: jsonb('validation_result').$type<Record<string, unknown>>(),

    totalRows: integer('total_rows').notNull().default(0),
    validRows: integer('valid_rows').notNull().default(0),
    errorRows: integer('error_rows').notNull().default(0),
    committedRows: integer('committed_rows').notNull().default(0),

    /**
     * @deprecated Prefer entity.import_batch_id. Kept for one release so
     * in-flight batches from the previous writer can still undo. New commits
     * no longer write this blob.
     */
    insertedIds: jsonb('inserted_ids').$type<{
      students?: string[];
      guardians?: string[];
      enrollments?: string[];
      staff?: string[];
    }>().default({}),

    startedByUserId: uuid('started_by_user_id').references(() => users.id),
    committedAt: timestamp('committed_at', { withTimezone: true }),
    undoneAt: timestamp('undone_at', { withTimezone: true }),

    ...timestamps,
    ...actorstamps,
  },
  (t) => ({
    tenantIdx: index('import_batches_tenant_idx').on(t.tenantId, t.createdAt),
    statusIdx: index('import_batches_status_idx').on(t.status),
  }),
);

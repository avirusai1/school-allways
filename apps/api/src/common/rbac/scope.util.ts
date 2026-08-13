/**
 * Turns a resolved permission scope into a SQL predicate.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ THIS IS WHERE "a teacher can only see their own sections" BECOMES    │
 * │ ACTUAL SQL. A hidden button in the UI is not access control.         │
 * │ Every list endpoint that returns student-linked rows MUST apply      │
 * │ scopeFilter(). The CI leak test greps for endpoints that don't.      │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Row Level Security already guarantees cross-TENANT isolation. This layer
 * handles the finer-grained, intra-tenant question that RLS cannot express:
 * which sections, which subjects, which children.
 */

import { ForbiddenException } from '@nestjs/common';
import { type SQL, and, inArray, sql } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

import type { GrantedPermission } from '../context/request-context';

export interface ScopeColumns {
  /** Column holding a section id, if the table has one. */
  sectionId?: PgColumn;
  /** Column holding a subject id, if the table has one. */
  subjectId?: PgColumn;
  /** Column holding a student id, for family-scope filtering. */
  studentId?: PgColumn;
  /** Column holding a branch id. */
  branchId?: PgColumn;
}

/**
 * Matches nothing. Returned whenever a scope resolves to an empty target list.
 *
 * A module-level singleton so callers and tests can compare by identity.
 * The DEFAULT for an empty scope must always be "deny", never "no filter" —
 * a teacher with no sections assigned yet must see zero students, not all of
 * them. That inversion is the classic multi-tenant leak.
 */
export const MATCH_NOTHING = sql`false`;

/**
 * Build the WHERE fragment for a granted permission.
 *
 * Returns `undefined` for tenant scope — meaning "no extra filter", because
 * RLS already constrains the query to one tenant.
 */
export function scopeFilter(
  grant: GrantedPermission,
  columns: ScopeColumns,
  opts: { branchId?: string | null } = {},
): SQL | undefined {
  switch (grant.scope) {
    case 'tenant':
      // RLS handles it. No further narrowing.
      return undefined;

    case 'branch': {
      if (!columns.branchId || !opts.branchId) return undefined;
      return sql`${columns.branchId} = ${opts.branchId}`;
    }

    case 'section': {
      const ids = grant.sectionIds ?? [];
      if (!columns.sectionId) {
        // The caller asked for section scope on a table with no section
        // column. That is a programming error, not a permission failure —
        // fail loudly rather than silently returning everything.
        throw new Error(
          `scopeFilter: permission '${grant.code}' is section-scoped but no ` +
            `sectionId column was supplied for this query.`,
        );
      }
      // Empty list means the teacher has no sections assigned yet. Return
      // nothing, never everything.
      if (ids.length === 0) return MATCH_NOTHING;
      return inArray(columns.sectionId, ids);
    }

    case 'subject': {
      const sectionIds = grant.sectionIds ?? [];
      const subjectIds = grant.subjectIds ?? [];
      const parts: SQL[] = [];

      if (columns.sectionId) {
        parts.push(sectionIds.length ? inArray(columns.sectionId, sectionIds) : MATCH_NOTHING);
      }
      if (columns.subjectId) {
        parts.push(subjectIds.length ? inArray(columns.subjectId, subjectIds) : MATCH_NOTHING);
      }

      if (parts.length === 0) {
        throw new Error(
          `scopeFilter: permission '${grant.code}' is subject-scoped but neither ` +
            `sectionId nor subjectId column was supplied.`,
        );
      }
      // AND, not OR: a subject teacher may touch their subject IN their
      // sections — not their subject everywhere, and not everything in
      // their sections.
      return and(...parts);
    }

    case 'self': {
      const ids = grant.studentIds ?? [];
      if (!columns.studentId) {
        throw new Error(
          `scopeFilter: permission '${grant.code}' is self-scoped but no ` +
            `studentId column was supplied for this query.`,
        );
      }
      if (ids.length === 0) return MATCH_NOTHING;
      return inArray(columns.studentId, ids);
    }

    default:
      // Unknown scope => deny. Never fall through to "no filter".
      return MATCH_NOTHING;
  }
}

/**
 * Assert that a specific row id is inside the grant's scope.
 * Use on single-record reads and on every mutation, where a filter is not
 * enough because the caller supplied the id.
 */
export function assertInScope(
  grant: GrantedPermission,
  target: { sectionId?: string | null; subjectId?: string | null; studentId?: string | null },
): void {
  switch (grant.scope) {
    case 'tenant':
    case 'branch':
      return;

    case 'section': {
      if (!target.sectionId || !(grant.sectionIds ?? []).includes(target.sectionId)) {
        throw new ForbiddenException(
          `Outside your assigned sections (permission: ${grant.code})`,
        );
      }
      return;
    }

    case 'subject': {
      const sectionOk =
        !!target.sectionId && (grant.sectionIds ?? []).includes(target.sectionId);
      const subjectOk =
        !!target.subjectId && (grant.subjectIds ?? []).includes(target.subjectId);
      if (!sectionOk || !subjectOk) {
        throw new ForbiddenException(
          `Outside your assigned subject/section (permission: ${grant.code})`,
        );
      }
      return;
    }

    case 'self': {
      if (!target.studentId || !(grant.studentIds ?? []).includes(target.studentId)) {
        throw new ForbiddenException(`Not your record (permission: ${grant.code})`);
      }
      return;
    }

    default:
      throw new ForbiddenException('Unknown permission scope');
  }
}

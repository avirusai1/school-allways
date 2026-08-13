/**
 * Tests for the scope predicate builder.
 *
 * These are the highest-value unit tests in the codebase. Every one of them
 * describes a way one school user could read another user's data, so a
 * failure here is a security incident, not a broken feature.
 *
 * Note the recurring assertion: an EMPTY scope target list must produce
 * "match nothing", never "match everything". That single inversion is the most
 * common way multi-tenant apps leak — a teacher with no sections assigned
 * accidentally seeing the entire school.
 */

import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { GrantedPermission } from '../context/request-context';
import { MATCH_NOTHING, assertInScope, scopeFilter } from './scope.util';

const columns = {
  sectionId: { name: 'section_id' },
  subjectId: { name: 'subject_id' },
  studentId: { name: 'student_id' },
  branchId: { name: 'branch_id' },
} as never;

function grant(partial: Partial<GrantedPermission>): GrantedPermission {
  return {
    code: 'student.record.read',
    scope: 'section',
    sectionIds: [],
    subjectIds: [],
    studentIds: [],
    ...partial,
  };
}

/** Identity comparison against the exported deny sentinel — not string sniffing. */
function isMatchNothing(sql: unknown): boolean {
  return sql === MATCH_NOTHING;
}

describe('scopeFilter', () => {
  it('applies no extra filter at tenant scope (RLS already constrains it)', () => {
    expect(scopeFilter(grant({ scope: 'tenant' }), columns)).toBeUndefined();
  });

  it('matches NOTHING when a section-scoped user has no sections', () => {
    const result = scopeFilter(grant({ scope: 'section', sectionIds: [] }), columns);
    expect(result).toBeDefined();
    expect(isMatchNothing(result)).toBe(true);
  });

  it('matches NOTHING when a self-scoped parent has no linked children', () => {
    const result = scopeFilter(grant({ scope: 'self', studentIds: [] }), columns);
    expect(result).toBeDefined();
    expect(isMatchNothing(result)).toBe(true);
  });

  it('matches NOTHING for an unrecognised scope rather than falling through', () => {
    const result = scopeFilter(
      grant({ scope: 'nonsense' as never }),
      columns,
    );
    expect(isMatchNothing(result)).toBe(true);
  });

  it('builds a real predicate when a section-scoped user has sections', () => {
    const result = scopeFilter(
      grant({ scope: 'section', sectionIds: ['sec-1', 'sec-2'] }),
      columns,
    );
    expect(result).toBeDefined();
    expect(isMatchNothing(result)).toBe(false);
  });

  it('throws when a section-scoped permission is used on a table with no section column', () => {
    expect(() =>
      scopeFilter(grant({ scope: 'section', sectionIds: ['sec-1'] }), {} as never),
    ).toThrow(/no sectionId column/);
  });

  it('throws when a self-scoped permission is used on a table with no student column', () => {
    expect(() =>
      scopeFilter(grant({ scope: 'self', studentIds: ['stu-1'] }), {} as never),
    ).toThrow(/no studentId column/);
  });
});

describe('assertInScope', () => {
  it('allows anything at tenant and branch scope', () => {
    expect(() => assertInScope(grant({ scope: 'tenant' }), {})).not.toThrow();
    expect(() => assertInScope(grant({ scope: 'branch' }), {})).not.toThrow();
  });

  it('blocks a class teacher from a section they do not own', () => {
    const g = grant({ scope: 'section', sectionIds: ['sec-1'] });
    expect(() => assertInScope(g, { sectionId: 'sec-1' })).not.toThrow();
    expect(() => assertInScope(g, { sectionId: 'sec-9' })).toThrow(ForbiddenException);
  });

  it('blocks a section-scoped user when no section is supplied at all', () => {
    const g = grant({ scope: 'section', sectionIds: ['sec-1'] });
    expect(() => assertInScope(g, {})).toThrow(ForbiddenException);
  });

  /**
   * The subject-scope rule is AND, not OR. A maths teacher for 5A may touch
   * maths in 5A — not maths everywhere, and not everything in 5A.
   */
  it('requires BOTH section and subject to match at subject scope', () => {
    const g = grant({
      code: 'exam.marks.enter',
      scope: 'subject',
      sectionIds: ['sec-1'],
      subjectIds: ['sub-maths'],
    });

    expect(() =>
      assertInScope(g, { sectionId: 'sec-1', subjectId: 'sub-maths' }),
    ).not.toThrow();

    // Right subject, wrong section — another teacher's class.
    expect(() =>
      assertInScope(g, { sectionId: 'sec-9', subjectId: 'sub-maths' }),
    ).toThrow(ForbiddenException);

    // Right section, wrong subject — not their paper to mark.
    expect(() =>
      assertInScope(g, { sectionId: 'sec-1', subjectId: 'sub-science' }),
    ).toThrow(ForbiddenException);
  });

  it('blocks a parent from another family\'s child', () => {
    const g = grant({ scope: 'self', studentIds: ['child-1', 'child-2'] });
    expect(() => assertInScope(g, { studentId: 'child-2' })).not.toThrow();
    expect(() => assertInScope(g, { studentId: 'child-99' })).toThrow(ForbiddenException);
  });

  it('blocks an unknown scope outright', () => {
    expect(() => assertInScope(grant({ scope: 'nonsense' as never }), {})).toThrow(
      ForbiddenException,
    );
  });
});

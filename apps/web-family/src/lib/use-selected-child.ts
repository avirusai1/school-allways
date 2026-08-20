import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';
import { useAuth } from './auth';

export type FamilyChild = {
  id: string;
  fullName: string;
  firstName: string;
  photoPath: string | null;
  classLabel?: string | null;
  subscribed?: boolean;
  status?: 'grace' | 'active' | 'locked';
  expiresAt?: string | null;
  graceEndsAt?: string | null;
};

function storageKey(tenantId: string): string {
  return `saw.family.selectedChild.${tenantId}`;
}

/**
 * Persistent selected child for the family web app (build/13 §4).
 * Per-child endpoints (home, fees, results, leave, books) require studentId;
 * diary/homework keep their multi-child self-scope default.
 */
export function useSelectedChild() {
  const { session } = useAuth();
  const tenantId = session?.tenant.id;

  /**
   * A student is not a guardian. `/family/children` requires
   * `family.child.read`, which the `student` role deliberately withholds, so
   * calling it as a student is a guaranteed 403 — which is exactly how every
   * per-child screen (books, results) used to break for students even though
   * they hold `book.read` and `exam.marks.read`. Their own id already arrives
   * on the session as `scopes.studentIds`, so resolve it locally instead.
   */
  const isStudent = session?.user?.kind === 'student';
  const ownStudentId = session?.scopes?.studentIds?.[0] ?? null;

  const childrenQuery = useQuery({
    queryKey: ['family', 'children'],
    queryFn: () => apiFetch<{ data: FamilyChild[] }>('/family/children'),
    enabled: !!session && !isStudent,
    staleTime: 5 * 60 * 1000,
  });

  const [selectedId, setSelectedIdState] = useState<string | null>(() => {
    if (!tenantId || typeof localStorage === 'undefined') return null;
    return localStorage.getItem(storageKey(tenantId));
  });

  const selfChild: FamilyChild[] =
    isStudent && ownStudentId
      ? [
          {
            id: ownStudentId,
            fullName: session?.user?.fullName ?? 'Me',
            firstName: session?.user?.displayName ?? session?.user?.fullName ?? 'Me',
            photoPath: null,
          },
        ]
      : [];

  const children = isStudent ? selfChild : (childrenQuery.data?.data ?? []);

  useEffect(() => {
    if (!tenantId || children.length === 0) return;
    const valid = selectedId != null && children.some((c) => c.id === selectedId);
    if (valid) return;
    const next = children[0]!.id;
    setSelectedIdState(next);
    localStorage.setItem(storageKey(tenantId), next);
  }, [children, selectedId, tenantId]);

  const setSelectedChildId = useCallback(
    (id: string) => {
      setSelectedIdState(id);
      if (tenantId) localStorage.setItem(storageKey(tenantId), id);
    },
    [tenantId],
  );

  const selectedChild = useMemo(
    () => children.find((c) => c.id === selectedId) ?? null,
    [children, selectedId],
  );

  return {
    children,
    // Students never issue the guardian query; report it as settled so callers
    // that gate on `isPending` do not spin forever on a query that never runs.
    childrenQuery: isStudent
      ? ({ isPending: false, isError: false, isSuccess: true, refetch: () => {} } as unknown as typeof childrenQuery)
      : childrenQuery,
    isStudent,
    selectedChild,
    studentId: selectedChild?.id ?? null,
    setSelectedChildId,
  };
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '../../lib/api';

export type ApprovalType =
  | 'staff_leave'
  | 'student_leave'
  | 'fee_concession'
  | 'circular';

export type ApprovalItem = {
  id: string;
  type: ApprovalType;
  subject: string;
  detail: string | null;
  summary: string | null;
  amountPaise?: number | null;
  reason: string | null;
  requestedAt: string;
};

export type ApprovalGroup = {
  type: ApprovalType;
  label: string;
  count: number;
  canDecide: boolean;
  items: ApprovalItem[];
};

export type ApprovalInbox = {
  total: number;
  groups: ApprovalGroup[];
};

export type Decision = {
  type: ApprovalType;
  ids: string[];
  action: 'approve' | 'reject';
  reason?: string;
};

export type DecisionResult = { decided: number; requested: number };

/** Which endpoint decides which queue — each carries its own permission. */
const DECIDE_PATH: Record<ApprovalType, string> = {
  staff_leave: '/approvals/leave/decide',
  student_leave: '/approvals/leave/decide',
  fee_concession: '/approvals/concessions/decide',
  circular: '/approvals/circulars/decide',
};

export function useApprovalInbox() {
  return useQuery({
    queryKey: ['approvals', 'inbox'],
    refetchOnWindowFocus: true,
    staleTime: 30_000,
    queryFn: () => apiFetch<ApprovalInbox>('/approvals'),
  });
}

/**
 * The dashboard's "Open items" tile counts the same rows, so it is invalidated
 * alongside the inbox — otherwise a principal clears the queue and the tile
 * behind it still says seven.
 */
export function useDecide() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ type, ids, action, reason }: Decision) =>
      apiFetch<DecisionResult>(DECIDE_PATH[type], {
        method: 'POST',
        body: JSON.stringify({ ids, action, reason }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['approvals'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';

export type SubscriptionRow = {
  id: string;
  fullName: string;
  admissionNo: string;
  classLabel: string | null;
  subscribed: boolean;
  status: 'grace' | 'active' | 'locked';
  source: string | null;
  expiresAt: string | null;
  notes: string | null;
};

export type SubscriptionList = {
  data: SubscriptionRow[];
  nextCursor: string | null;
  meta: {
    academicSessionId: string;
    sessionName: string;
    sessionEndDate: string;
    inGrace: boolean;
    graceEndsAt: string | null;
    amountPaise: number;
  };
};

export type StayConnectedStatus = {
  fee: {
    id: string;
    status: string;
    dueDate: string;
    totalPaise: number;
    basePaise: number;
    gstPaise: number;
    paidAt: string | null;
    invoiceNumber: string | null;
  } | null;
  inGrace: boolean;
  graceDays: number;
  graceEndsAt: string | null;
  sessionName: string | null;
};

export function useSubscriptionList(filters: {
  q?: string;
  classId?: string;
  sectionId?: string;
}) {
  return useQuery({
    queryKey: ['subscriptions', filters],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100' });
      if (filters.q?.trim()) params.set('q', filters.q.trim());
      if (filters.classId) params.set('classId', filters.classId);
      if (filters.sectionId) params.set('sectionId', filters.sectionId);
      return apiFetch<SubscriptionList>(`/subscriptions?${params}`);
    },
    staleTime: 15_000,
  });
}

export function useStayConnected(enabled = true) {
  return useQuery({
    queryKey: ['subscriptions', 'stay-connected'],
    queryFn: () => apiFetch<StayConnectedStatus>('/subscriptions/stay-connected'),
    staleTime: 60_000,
    enabled,
  });
}

export function useManualActivate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: Array<{ studentId: string; notes?: string }>) => {
      return apiFetch<{
        activated: string[];
        skipped: string[];
        skippedReasons: Record<string, string>;
        billedAmountPaise: number;
      }>('/subscriptions/manual-activate', {
        method: 'POST',
        headers: { 'X-Client-Mutation-Id': crypto.randomUUID() },
        body: JSON.stringify({ items }),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['subscriptions'] });
    },
  });
}

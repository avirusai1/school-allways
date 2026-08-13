import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { apiFetch } from '../../lib/api';

const pendingStaffSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  phone: z.string(),
  hasEmail: z.boolean(),
  designation: z.string(),
});

const pendingListSchema = z.object({
  data: z.array(pendingStaffSchema),
  meta: z.object({ count: z.number() }),
});

const bulkIssueSchema = z.object({
  issued: z.array(
    z.object({
      id: z.string().uuid(),
      fullName: z.string(),
      phone: z.string(),
      temporaryPassword: z.string(),
    }),
  ),
  skipped: z.array(z.string().uuid()),
  skippedReasons: z.record(z.string()),
});

export type PendingStaff = z.infer<typeof pendingStaffSchema>;
export type IssuedStaffAccount = z.infer<typeof bulkIssueSchema>['issued'][number];

export function usePendingStaff(filters: { q?: string }) {
  return useQuery({
    queryKey: ['staff', 'pending-accounts', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.q?.trim()) params.set('q', filters.q.trim());
      const raw = await apiFetch<unknown>(`/staff/pending-accounts?${params}`);
      return pendingListSchema.parse(raw);
    },
    staleTime: 30_000,
  });
}

export function useBulkIssueStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { ids?: string[]; all?: boolean }) => {
      const raw = await apiFetch<unknown>('/staff/account/bulk-issue', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return bulkIssueSchema.parse(raw);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['staff', 'pending-accounts'] });
    },
  });
}

export async function downloadStaffCredentialsCsv(body: {
  ids?: string[];
  all?: boolean;
}): Promise<void> {
  const token = localStorage.getItem('saw.accessToken');
  const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001/v1';
  const res = await fetch(`${API_BASE}/staff/account/bulk-issue?format=csv`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Could not download credentials.');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'staff-credentials.csv';
  a.click();
  URL.revokeObjectURL(url);
}

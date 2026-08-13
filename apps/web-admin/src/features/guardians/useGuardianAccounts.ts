import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { apiFetch, apiUpload } from '../../lib/api';

const pendingGuardianSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  phone: z.string(),
  hasEmail: z.boolean(),
  sectionLabel: z.string(),
});

const pendingListSchema = z.object({
  data: z.array(pendingGuardianSchema),
  meta: z.object({ count: z.number() }),
});

const bulkIssueSchema = z.object({
  issued: z.array(
    z.object({
      id: z.string().uuid(),
      fullName: z.string(),
      phone: z.string(),
      temporaryPassword: z.string(),
      sectionLabel: z.string().optional(),
    }),
  ),
  skipped: z.array(z.string().uuid()),
  skippedReasons: z.record(z.string()),
});

const emailUpdateSchema = z.object({
  matched: z.number(),
  updated: z.number(),
  unmatched: z.array(z.string()),
  inviteReadyGuardianIds: z.array(z.string().uuid()),
});

export type PendingGuardian = z.infer<typeof pendingGuardianSchema>;
export type IssuedGuardianAccount = z.infer<typeof bulkIssueSchema>['issued'][number];

export function usePendingGuardians(filters: {
  sectionId?: string;
  classId?: string;
  q?: string;
}) {
  return useQuery({
    queryKey: ['guardians', 'pending-accounts', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.sectionId) params.set('sectionId', filters.sectionId);
      if (filters.classId) params.set('classId', filters.classId);
      if (filters.q?.trim()) params.set('q', filters.q.trim());
      const raw = await apiFetch<unknown>(`/guardians/pending-accounts?${params}`);
      return pendingListSchema.parse(raw);
    },
    staleTime: 30_000,
  });
}

export function useBulkIssueGuardians() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { ids?: string[]; all?: boolean; sectionId?: string }) => {
      const raw = await apiFetch<unknown>('/guardians/account/bulk-issue', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return bulkIssueSchema.parse(raw);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['guardians', 'pending-accounts'] });
    },
  });
}

export function useBulkUpdateGuardianEmails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const raw = await apiUpload<unknown>('/guardians/emails/bulk-update', form);
      return emailUpdateSchema.parse(raw);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['guardians', 'pending-accounts'] });
    },
  });
}

export function useInviteGuardiansById() {
  return useMutation({
    mutationFn: async (guardianIds: string[]) => {
      return apiFetch<{ invited: number; queued: number }>('/guardians/invite', {
        method: 'POST',
        body: JSON.stringify({ guardianIds }),
      });
    },
  });
}

export async function downloadGuardianCredentialsCsv(body: {
  ids?: string[];
  all?: boolean;
  sectionId?: string;
}): Promise<void> {
  const token = localStorage.getItem('saw.accessToken');
  const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001/v1';
  const res = await fetch(`${API_BASE}/guardians/account/bulk-issue?format=csv`, {
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
  a.download = 'guardian-credentials.csv';
  a.click();
  URL.revokeObjectURL(url);
}

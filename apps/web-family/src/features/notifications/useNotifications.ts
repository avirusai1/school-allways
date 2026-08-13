import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { apiFetch } from '../../lib/api';

const inboxItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  body: z.string(),
  priority: z.string(),
  readAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  createdAt: z.string(),
  templateCode: z.string().nullable(),
  announcementId: z.string().uuid().nullable(),
});

const inboxSchema = z.object({
  data: z.array(inboxItemSchema),
  meta: z.object({ unread: z.number() }),
});

export type InboxItem = z.infer<typeof inboxItemSchema>;

export function useNotificationInbox() {
  return useQuery({
    queryKey: ['notifications', 'inbox'],
    queryFn: async () => {
      const raw = await apiFetch<unknown>('/notifications/inbox');
      return inboxSchema.parse(raw);
    },
    staleTime: 15_000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiFetch(`/notifications/inbox/${id}/read`, { method: 'PATCH' });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications', 'inbox'] });
    },
  });
}

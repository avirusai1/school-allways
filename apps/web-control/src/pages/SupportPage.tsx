import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Chip,
  Dialog,
  EmptyState,
  ErrorState,
  ListRow,
  Select,
  Skeleton,
  TextField,
} from '@saw/ui';
import { apiFetch } from '../lib/api';

/** Matches PlatformService.listOpenSupportSessions(). */
type OpenSession = {
  id: string;
  tenantId: string;
  tenantName: string;
  reason: string;
  ticketRef: string | null;
  accessLevel: 'read_only' | 'read_write';
  startedAt: string;
  expiresAt: string;
  agentUserId: string;
};

type SchoolOption = { id: string; name: string };

function minutesLeft(expiresAt: string): number {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000));
}

/**
 * Audited support access.
 *
 * There is no "end session" endpoint — sessions are time-boxed by design (see
 * the platform_support role: "Time-boxed, audited impersonation") and expire
 * on their own. This page's job is visibility into what is currently open and
 * a controlled way to open a new one, not manual revocation.
 */
export function SupportPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const sessions = useQuery({
    queryKey: ['platform', 'support-sessions'],
    queryFn: async () => {
      const raw = await apiFetch<{ data?: OpenSession[] } | OpenSession[]>(
        '/platform/support-sessions',
      );
      return Array.isArray(raw) ? raw : (raw.data ?? []);
    },
    refetchInterval: 30_000,
  });

  const schools = useQuery({
    queryKey: ['platform', 'schools', 'picker'],
    queryFn: async () => {
      const raw = await apiFetch<{ data?: SchoolOption[] } | SchoolOption[]>(
        '/platform/schools',
      );
      return Array.isArray(raw) ? raw : (raw.data ?? []);
    },
    enabled: open,
  });

  const [tenantId, setTenantId] = useState('');
  const [reason, setReason] = useState('');
  const [ticketRef, setTicketRef] = useState('');
  const [duration, setDuration] = useState('60');

  const create = useMutation({
    mutationFn: () =>
      apiFetch('/platform/support-sessions', {
        method: 'POST',
        body: JSON.stringify({
          tenantId,
          reason: reason.trim(),
          ticketRef: ticketRef.trim() || undefined,
          durationMinutes: Number(duration),
        }),
      }),
    onSuccess: () => {
      setOpen(false);
      setTenantId('');
      setReason('');
      setTicketRef('');
      setDuration('60');
      void qc.invalidateQueries({ queryKey: ['platform', 'support-sessions'] });
    },
  });

  const reasonValid = reason.trim().length >= 20;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h1 text-grey-900">Support access</h1>
          <p className="mt-1 text-body-small text-grey-600">
            Every session is time-boxed, notifies the school, and is written to the audit log.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>Open session</Button>
      </div>

      <div className="mt-6">
        {sessions.isPending && <Skeleton height={160} className="w-full" />}
        {sessions.isError && (
          <ErrorState
            message={
              sessions.error instanceof Error ? sessions.error.message : 'Could not load sessions'
            }
            onRetry={() => void sessions.refetch()}
          />
        )}
        {sessions.isSuccess && sessions.data.length === 0 && (
          <EmptyState
            headline="No open sessions"
            body="Nobody from our team currently has support access to a school."
          />
        )}
        {sessions.isSuccess && sessions.data.length > 0 && (
          <Card padding={false}>
            {sessions.data.map((s) => (
              <ListRow
                key={s.id}
                title={s.tenantName}
                subtitle={`${s.reason}${s.ticketRef ? ` · ${s.ticketRef}` : ''}`}
                trailing={
                  <Chip
                    label={`${s.accessLevel === 'read_write' ? 'read/write' : 'read only'} · ${minutesLeft(s.expiresAt)}m left`}
                    tone={s.accessLevel === 'read_write' ? 'warning' : 'neutral'}
                  />
                }
              />
            ))}
          </Card>
        )}
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Open a support session"
        description="Write access requires supervisor approval and is not available from this form."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={!tenantId || !reasonValid || create.isPending}
            >
              {create.isPending ? 'Opening…' : 'Open session'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Select
            label="School"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            options={[
              { value: '', label: schools.isPending ? 'Loading…' : 'Select a school' },
              ...(schools.data ?? []).map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
          <TextField
            label="Reason"
            hint="At least 20 characters — the school sees this."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <TextField
            label="Ticket reference"
            hint="Optional"
            value={ticketRef}
            onChange={(e) => setTicketRef(e.target.value)}
          />
          <Select
            label="Duration"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            options={[
              { value: '30', label: '30 minutes' },
              { value: '60', label: '1 hour' },
              { value: '120', label: '2 hours' },
              { value: '240', label: '4 hours (maximum)' },
            ]}
          />
          {create.isError && (
            <p className="text-body-small text-red-500">
              {create.error instanceof Error ? create.error.message : 'Could not open the session'}
            </p>
          )}
        </div>
      </Dialog>
    </div>
  );
}

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Chip,
  Dialog,
  ErrorState,
  ListRow,
  Select,
  Skeleton,
  TextField,
} from '@saw/ui';
import { apiFetch } from '../lib/api';

type Flag = {
  id: string;
  key: string;
  name?: string;
  description?: string;
  enabled?: boolean;
  rolloutPercentage?: number;
};

type SchoolOption = { id: string; name: string };

export function FlagsPage() {
  const qc = useQueryClient();
  const [killTarget, setKillTarget] = useState<Flag | null>(null);
  const [overrideTarget, setOverrideTarget] = useState<Flag | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const flags = useQuery({
    queryKey: ['platform', 'flags'],
    queryFn: async () => {
      const raw = await apiFetch<{ data?: Flag[] } | Flag[]>('/platform/flags');
      return Array.isArray(raw) ? raw : (raw.data ?? []);
    },
  });

  const kill = useMutation({
    mutationFn: (vars: { id: string; enabled: boolean }) =>
      apiFetch(`/platform/flags/${vars.id}/kill`, {
        method: 'POST',
        body: JSON.stringify({ enabled: vars.enabled }),
      }),
    onSuccess: () => {
      setKillTarget(null);
      void qc.invalidateQueries({ queryKey: ['platform', 'flags'] });
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h1 text-grey-900">Feature flags</h1>
          <p className="mt-1 text-body-small text-grey-600">
            Kill switches and per-school overrides take effect within minutes via cache TTL.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>New flag</Button>
      </div>

      <div className="mt-6">
        {flags.isPending && <Skeleton height={160} className="w-full" />}
        {flags.isError && (
          <ErrorState
            message={flags.error instanceof Error ? flags.error.message : 'Failed'}
            onRetry={() => void flags.refetch()}
          />
        )}
        {flags.isSuccess && (
          <Card padding={false}>
            {flags.data.length === 0 && (
              <p className="p-4 text-body-small text-grey-500">No flags defined.</p>
            )}
            {flags.data.map((f) => (
              <ListRow
                key={f.id}
                title={f.key}
                subtitle={f.description}
                trailing={
                  <div className="flex items-center gap-2">
                    <Chip
                      label={f.enabled === false ? 'off' : `${f.rolloutPercentage ?? 100}%`}
                      tone={f.enabled === false ? 'danger' : 'success'}
                    />
                    <Button size="inline" variant="ghost" onClick={() => setOverrideTarget(f)}>
                      Override
                    </Button>
                    <Button
                      size="inline"
                      variant="ghost"
                      onClick={() => setKillTarget(f)}
                    >
                      {f.enabled === false ? 'Restore' : 'Kill'}
                    </Button>
                  </div>
                }
              />
            ))}
          </Card>
        )}
      </div>

      <Dialog
        open={killTarget != null}
        onClose={() => setKillTarget(null)}
        title={
          killTarget
            ? killTarget.enabled === false
              ? `Restore ${killTarget.key}?`
              : `Kill ${killTarget.key}?`
            : ''
        }
        description={
          killTarget?.enabled === false
            ? 'Re-enables the flag at its configured rollout for every school.'
            : 'Disables the flag for every school immediately. Use for a live incident.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setKillTarget(null)}>
              Cancel
            </Button>
            <Button
              variant={killTarget?.enabled === false ? 'primary' : 'danger'}
              disabled={kill.isPending}
              onClick={() =>
                killTarget &&
                kill.mutate({ id: killTarget.id, enabled: killTarget.enabled === false })
              }
            >
              {kill.isPending
                ? 'Working…'
                : killTarget?.enabled === false
                  ? 'Restore'
                  : 'Kill switch'}
            </Button>
          </>
        }
      />

      {overrideTarget && (
        <FlagOverrideDialog
          flag={overrideTarget}
          onClose={() => setOverrideTarget(null)}
          onDone={() => {
            setOverrideTarget(null);
            void qc.invalidateQueries({ queryKey: ['platform', 'flags'] });
          }}
        />
      )}

      {createOpen && (
        <CreateFlagDialog
          onClose={() => setCreateOpen(false)}
          onDone={() => {
            setCreateOpen(false);
            void qc.invalidateQueries({ queryKey: ['platform', 'flags'] });
          }}
        />
      )}
    </div>
  );
}

function FlagOverrideDialog({
  flag,
  onClose,
  onDone,
}: {
  flag: Flag;
  onClose: () => void;
  onDone: () => void;
}) {
  const [tenantId, setTenantId] = useState('');
  const [value, setValue] = useState('true');
  const [reason, setReason] = useState('');

  const schools = useQuery({
    queryKey: ['platform', 'schools', 'picker'],
    queryFn: async () => {
      const raw = await apiFetch<{ data?: SchoolOption[] } | SchoolOption[]>(
        '/platform/schools',
      );
      return Array.isArray(raw) ? raw : (raw.data ?? []);
    },
  });

  const override = useMutation({
    mutationFn: () =>
      apiFetch(`/platform/flags/${flag.id}/override`, {
        method: 'POST',
        body: JSON.stringify({
          tenantId,
          value: value === 'true' ? true : value === 'false' ? false : value,
          reason: reason.trim(),
        }),
      }),
    onSuccess: onDone,
  });

  const reasonValid = reason.trim().length >= 5;

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Override ${flag.key} for one school`}
      description="Overrides the flag's default for a single tenant. Written to the audit log."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!tenantId || !reasonValid || override.isPending}
            onClick={() => override.mutate()}
          >
            {override.isPending ? 'Saving…' : 'Save override'}
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
        <Select
          label="Value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          options={[
            { value: 'true', label: 'On' },
            { value: 'false', label: 'Off' },
          ]}
        />
        <TextField
          label="Reason"
          hint="At least 5 characters."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {override.isError && (
          <p className="text-body-small text-red-500">
            {override.error instanceof Error ? override.error.message : 'Could not save'}
          </p>
        )}
      </div>
    </Dialog>
  );
}

function CreateFlagDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rollout, setRollout] = useState('0');

  const create = useMutation({
    mutationFn: () =>
      apiFetch('/platform/flags', {
        method: 'POST',
        body: JSON.stringify({
          key: key.trim(),
          name: name.trim(),
          description: description.trim() || undefined,
          kind: 'percentage',
          rolloutPercentage: Number(rollout),
        }),
      }),
    onSuccess: onDone,
  });

  const valid = key.trim().length > 0 && name.trim().length > 0;

  return (
    <Dialog
      open
      onClose={onClose}
      title="New feature flag"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Creating…' : 'Create flag'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          label="Key"
          hint="e.g. exam_hpc_v2 — used in code, cannot be changed later."
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <TextField
          label="Description"
          hint="Optional"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <TextField
          label="Initial rollout %"
          type="number"
          min={0}
          max={100}
          value={rollout}
          onChange={(e) => setRollout(e.target.value)}
        />
        {create.isError && (
          <p className="text-body-small text-red-500">
            {create.error instanceof Error ? create.error.message : 'Could not create the flag'}
          </p>
        )}
      </div>
    </Dialog>
  );
}

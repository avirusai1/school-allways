import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Chip,
  DataTable,
  ErrorState,
  Skeleton,
  TextField,
  type ChipTone,
  type DataTableColumn,
} from '@saw/ui';
import { apiFetch } from '../lib/api';

/** Matches `/platform/schools`. Health fields are null until a rollup runs. */
type SchoolRow = {
  id: string;
  name: string;
  slug: string;
  planTier: string;
  status: string;
  band: string | null;
  score: number | null;
  studentCount: number | null;
  lastActivityDay: string | null;
};

const bandTone: Record<string, ChipTone> = {
  healthy: 'success',
  activated: 'success',
  onboarding: 'info',
  not_started: 'neutral',
  at_risk: 'warning',
  churning: 'danger',
  dormant: 'danger',
};

const columns: DataTableColumn<SchoolRow>[] = [
  {
    id: 'name',
    header: 'School',
    cell: (r) => (
      <Link to={`/schools/${r.id}`} className="font-medium text-blue-700 hover:underline">
        {r.name}
      </Link>
    ),
  },
  {
    id: 'plan',
    header: 'Plan',
    cell: (r) => <span className="text-grey-700">{r.planTier}</span>,
  },
  {
    id: 'health',
    header: 'Health',
    cell: (r) =>
      r.band ? (
        <Chip label={`${r.band.replace(/_/g, ' ')} · ${r.score ?? 0}`} tone={bandTone[r.band] ?? 'neutral'} />
      ) : (
        <span className="text-grey-500">no rollup yet</span>
      ),
  },
  {
    id: 'students',
    header: 'Students',
    numeric: true,
    cell: (r) => (r.studentCount == null ? '—' : String(r.studentCount)),
  },
  {
    id: 'activity',
    header: 'Last activity',
    cell: (r) => r.lastActivityDay ?? '—',
  },
];

export function SchoolsPage() {
  const [q, setQ] = useState('');
  const schools = useQuery({
    queryKey: ['platform', 'schools', q],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      const raw = await apiFetch<{ data?: SchoolRow[] } | SchoolRow[]>(
        `/platform/schools?${params}`,
      );
      return Array.isArray(raw) ? raw : (raw.data ?? []);
    },
  });

  return (
    <div>
      <h1 className="text-h1 text-grey-900">Schools</h1>
      <div className="mt-4 max-w-sm">
        <TextField
          label="Filter"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name or slug"
        />
      </div>
      <div className="mt-4">
        {schools.isPending && <Skeleton height={240} className="w-full" />}
        {schools.isError && (
          <ErrorState
            message={schools.error instanceof Error ? schools.error.message : 'Failed'}
            onRetry={() => void schools.refetch()}
          />
        )}
        {schools.isSuccess && (
          <DataTable
            columns={columns}
            rows={schools.data}
            rowKey={(r) => r.id}
            density="compact"
            maxHeight={560}
          />
        )}
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Avatar,
  DataTable,
  EmptyState,
  ErrorState,
  Skeleton,
  TextField,
  type DataTableColumn,
} from '@saw/ui';
import { studentListItemSchema, type StudentListItem } from '@saw/shared-types';
import { z } from 'zod';
import { apiFetch } from '../lib/api';

const pageSchema = z.object({
  data: z.array(studentListItemSchema),
  nextCursor: z.string().nullish(),
});

export function StudentsPage() {
  const [q, setQ] = useState('');
  const [density, setDensity] = useState<'compact' | 'comfortable'>('compact');

  const query = useQuery({
    queryKey: ['students', q],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100' });
      if (q.trim()) params.set('q', q.trim());
      const raw = await apiFetch<unknown>(`/students?${params}`);
      return pageSchema.parse(raw);
    },
    staleTime: 5 * 60 * 1000,
  });

  const columns = useMemo<DataTableColumn<StudentListItem>[]>(
    () => [
      {
        id: 'name',
        header: 'Student',
        cell: (row) => (
          <div className="flex items-center gap-2">
            <Avatar name={row.fullName} src={row.photoUrl ?? undefined} size={32} />
            <span className="font-medium text-grey-900">{row.fullName}</span>
          </div>
        ),
      },
      {
        id: 'admission',
        header: 'Admission no.',
        cell: (row) => row.admissionNo ?? '—',
      },
      {
        id: 'class',
        header: 'Class',
        cell: (row) =>
          [row.className, row.sectionName].filter(Boolean).join(' · ') || '—',
      },
      {
        id: 'roll',
        header: 'Roll',
        numeric: true,
        cell: (row) => row.rollNo ?? '—',
      },
    ],
    [],
  );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 text-grey-900">Students</h1>
          <p className="mt-1 text-body-small text-grey-600">
            Scoped to your sections — empty scope matches nothing.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Link
            to="/students/guardian-accounts"
            className="text-[13px] font-medium text-blue-600 hover:underline"
          >
            Guardian accounts
          </Link>
          <button
          type="button"
          className="text-[13px] font-medium text-blue-600 hover:underline"
          onClick={() =>
            setDensity((d) => (d === 'compact' ? 'comfortable' : 'compact'))
          }
        >
          Density: {density}
        </button>
        </div>
      </div>

      <div className="mt-4 max-w-sm">
        <TextField
          label="Search"
          placeholder="Name or admission no."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="mt-4">
        {query.isPending && <Skeleton height={256} className="w-full" />}
        {query.isError && (
          <ErrorState
            message={
              query.error instanceof Error
                ? query.error.message
                : 'Could not load students'
            }
            onRetry={() => void query.refetch()}
          />
        )}
        {query.isSuccess && query.data.data.length === 0 && (
          <EmptyState
            headline="No students"
            body="Nothing in your current scope."
          />
        )}
        {query.isSuccess && query.data.data.length > 0 && (
          <DataTable
            columns={columns}
            rows={query.data.data}
            rowKey={(r) => r.id}
            density={density}
            maxHeight={560}
            virtualizeAbove={100}
          />
        )}
      </div>
    </div>
  );
}

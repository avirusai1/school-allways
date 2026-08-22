import { useQuery } from '@tanstack/react-query';
import { EmptyState, Skeleton, ListRow, formatSawDate } from '@saw/ui';
import { ChildSwitcher } from '../components/ChildSwitcher';
import { PaywallOrError } from '../components/PaywallOrError';
import { apiFetch } from '../lib/api';
import { useSelectedChild } from '../lib/use-selected-child';

/** Matches FamilyService.listLeaveRequests(). */
type LeaveRow = {
  id: string;
  fromDate: string;
  toDate: string;
  reason: string;
  status: string;
  dayCount: number;
  createdAt: string;
};

export function LeavePage() {
  const { children, studentId, setSelectedChildId } = useSelectedChild();

  const q = useQuery({
    queryKey: ['family', 'leave', studentId],
    queryFn: () =>
      apiFetch<{ data: LeaveRow[] }>(
        `/family/leave?studentId=${encodeURIComponent(studentId!)}`,
      ),
    enabled: !!studentId,
  });
  const rows = q.data?.data ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-h1 text-grey-900">Leave</h1>
          <p className="mt-1 text-body-small text-grey-600">
            Apply from the mobile app for the fullest experience; history shows here.
          </p>
        </div>
        <ChildSwitcher
          children={children}
          selectedId={studentId}
          onSelect={setSelectedChildId}
        />
      </div>
      <div className="mt-6">
        {!studentId && <Skeleton height={120} className="w-full" />}
        {studentId && q.isPending && <Skeleton height={120} className="w-full" />}
        {q.isError && (
          <PaywallOrError
            error={q.error}
            children={children}
            highlightId={studentId}
            fallback="Could not load leave"
            onRetry={() => void q.refetch()}
          />
        )}
        {q.isSuccess && rows.length === 0 && (
          <EmptyState headline="No leave applications" body="When you apply, they will list here." />
        )}
        {q.isSuccess && rows.length > 0 && (
          <div className="overflow-hidden rounded-md bg-surface-container-low">
            {rows.map((r) => (
              <ListRow
                key={r.id}
                title={r.status}
                subtitle={`${formatSawDate(r.fromDate)} – ${formatSawDate(r.toDate)}${
                  r.dayCount ? ` · ${r.dayCount} day${r.dayCount === 1 ? '' : 's'}` : ''
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

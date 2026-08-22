import { useQuery } from '@tanstack/react-query';
import { EmptyState, Skeleton, ListRow } from '@saw/ui';
import { ChildSwitcher } from '../components/ChildSwitcher';
import { PaywallOrError } from '../components/PaywallOrError';
import { apiFetch } from '../lib/api';
import { useSelectedChild } from '../lib/use-selected-child';

/** Matches ExamsService.getResults() family payload. */
type ResultRow = {
  id: string;
  examId: string;
  examName: string;
  obtainedMarks: number | null;
  totalMarks: number | null;
  percentageBp: number | null;
  grade: string | null;
  status: string;
};

export function ResultsPage() {
  const { children, studentId, setSelectedChildId } = useSelectedChild();

  const q = useQuery({
    queryKey: ['family', 'results', studentId],
    queryFn: () =>
      apiFetch<{ data: ResultRow[] }>(
        `/family/results?studentId=${encodeURIComponent(studentId!)}`,
      ),
    enabled: !!studentId,
  });
  const rows = q.data?.data ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-h1 text-grey-900">Results</h1>
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
            fallback="Could not load results"
            onRetry={() => void q.refetch()}
          />
        )}
        {q.isSuccess && rows.length === 0 && (
          <EmptyState
            headline="No published results"
            body="Results appear here after the school publishes them."
          />
        )}
        {q.isSuccess && rows.length > 0 && (
          <div className="overflow-hidden rounded-md bg-surface-container-low">
            {rows.map((r) => {
              const marks =
                r.obtainedMarks != null && r.totalMarks != null
                  ? `${r.obtainedMarks}/${r.totalMarks}`
                  : null;
              const pct =
                r.percentageBp != null ? `${(r.percentageBp / 100).toFixed(1)}%` : null;
              const subtitle = [marks, pct, r.grade].filter(Boolean).join(' · ') || r.status;
              return <ListRow key={r.id} title={r.examName} subtitle={subtitle} />;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

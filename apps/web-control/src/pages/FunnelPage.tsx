import { useQuery } from '@tanstack/react-query';
import { Card, ErrorState, SectionHeader, Skeleton } from '@saw/ui';
import { apiFetch } from '../lib/api';

/** Matches PlatformService.funnel() — one row per (step, action). */
type FunnelRow = {
  step: string;
  action: string;
  count: number;
  medianDurationSeconds: number | null;
};

const STEP_ORDER = [
  'signup',
  'school_setup',
  'import_staff',
  'import_students',
  'first_attendance',
  'activated',
];

function stepLabel(step: string): string {
  return step
    .split('_')
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ');
}

function duration(seconds: number | null): string {
  if (seconds == null) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

export function FunnelPage() {
  const q = useQuery({
    queryKey: ['platform', 'funnel'],
    queryFn: () => apiFetch<{ data: FunnelRow[] }>('/platform/funnel'),
  });

  if (q.isPending) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton height={40} className="w-48" />
        <Skeleton height={320} className="w-full" />
      </div>
    );
  }

  if (q.isError) {
    return (
      <ErrorState
        message={q.error instanceof Error ? q.error.message : 'Could not load the funnel'}
        onRetry={() => void q.refetch()}
      />
    );
  }

  const rows = q.data?.data ?? [];
  const byStep = new Map<string, FunnelRow[]>();
  for (const row of rows) {
    if (!byStep.has(row.step)) byStep.set(row.step, []);
    byStep.get(row.step)!.push(row);
  }

  const steps = [
    ...STEP_ORDER.filter((s) => byStep.has(s)),
    ...[...byStep.keys()].filter((s) => !STEP_ORDER.includes(s)),
  ];

  const startedCounts = new Map(
    steps.map((step) => [
      step,
      byStep.get(step)!.find((r) => r.action === 'started')?.count ??
        byStep.get(step)!.reduce((max, r) => Math.max(max, r.count), 0),
    ]),
  );
  const firstCount = startedCounts.get(steps[0] ?? '') ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h1 text-grey-900">Onboarding funnel</h1>
        <p className="mt-1 text-body-small text-grey-600">
          Step drop-off across every school that has started setup.
        </p>
      </div>

      <section>
        <SectionHeader title="Drop-off by step" />
        <Card padding={false}>
          {steps.length === 0 ? (
            <p className="p-4 text-body-small text-grey-500">
              No onboarding activity recorded yet.
            </p>
          ) : (
            steps.map((step) => {
              const started = startedCounts.get(step) ?? 0;
              const pct = firstCount > 0 ? Math.round((started / firstCount) * 100) : 0;
              const median = byStep
                .get(step)!
                .find((r) => r.medianDurationSeconds != null)?.medianDurationSeconds;
              return (
                <div key={step} className="border-b border-grey-100 px-4 py-3 last:border-b-0">
                  <div className="flex items-baseline justify-between">
                    <span className="font-medium text-grey-900">{stepLabel(step)}</span>
                    <span className="tabular-nums text-body-small text-grey-600">
                      {started} schools · {pct}% · median {duration(median ?? null)}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-grey-100">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </Card>
      </section>
    </div>
  );
}

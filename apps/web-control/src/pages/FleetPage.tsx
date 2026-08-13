import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import { Chip, ErrorState, Skeleton, StatTile, ListRow, formatIndianMoney } from '@saw/ui';
import { apiFetch } from '../lib/api';

/**
 * These types describe what `/platform/fleet` and `/platform/alerts` actually
 * return. They previously described something else entirely — `schoolsActive`,
 * `studentsApprox`, a `series` for a line chart — none of which the API has
 * ever sent, so every tile on this page rendered an em-dash and the alert list
 * rendered rows with no title and an undefined React key.
 */
type FleetDto = {
  schools: number;
  byBand: Record<string, number>;
  totals: { students: number; staff: number; smsCostPaise: number };
};

type RevenueDto = { mrrPaise: number; activeSubscriptions: number; trialSubscriptions: number };

type SeriesDto = {
  days: number;
  definition: string;
  data: { day: string; activeSchools: number }[];
};

type AlertRow = {
  tenantId: string;
  name: string;
  band: string;
  score: number;
  riskReasons: string[] | null;
};

export function FleetPage() {
  const fleet = useQuery({
    queryKey: ['platform', 'fleet'],
    queryFn: () => apiFetch<FleetDto>('/platform/fleet'),
  });
  // MRR lives on /platform/revenue, not /platform/fleet. The tile is worth
  // keeping on this page; the second call is the price of that.
  const revenue = useQuery({
    queryKey: ['platform', 'revenue'],
    queryFn: () => apiFetch<RevenueDto>('/platform/revenue'),
  });
  const alerts = useQuery({
    queryKey: ['platform', 'alerts'],
    queryFn: () => apiFetch<{ data?: AlertRow[] } | AlertRow[]>('/platform/alerts'),
  });
  const series = useQuery({
    queryKey: ['platform', 'fleet', 'series', 30],
    queryFn: () => apiFetch<SeriesDto>('/platform/fleet/series?days=30'),
  });

  const alertRows = Array.isArray(alerts.data) ? alerts.data : (alerts.data?.data ?? []);
  const bands = Object.entries(fleet.data?.byBand ?? {});

  return (
    <div>
      <h1 className="text-h1 text-grey-900">Fleet</h1>
      <p className="mt-1 text-body-small text-grey-600">
        Rollup metrics only. This console never queries student tables.
      </p>

      {fleet.isPending && <Skeleton height={180} className="mt-6 w-full" />}
      {fleet.isError && (
        <div className="mt-6">
          <ErrorState
            message={fleet.error instanceof Error ? fleet.error.message : 'Fleet failed'}
            onRetry={() => void fleet.refetch()}
          />
        </div>
      )}

      {fleet.isSuccess && (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Schools" value={String(fleet.data.schools)} />
            <StatTile label="Students" value={String(fleet.data.totals.students)} />
            <StatTile label="Staff" value={String(fleet.data.totals.staff)} />
            <StatTile
              label="MRR"
              value={revenue.data ? formatIndianMoney(revenue.data.mrrPaise, false) : '—'}
              caption={
                revenue.data
                  ? `${revenue.data.activeSubscriptions} paid · ${revenue.data.trialSubscriptions} trial`
                  : undefined
              }
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2 rounded-md border border-grey-200 bg-grey-0 p-4">
            {bands.map(([band, count]) => (
              <Chip key={band} label={`${band}: ${count}`} />
            ))}
            {bands.length === 0 && (
              <span className="text-caption text-grey-500">
                Health bands appear after the nightly rollup runs.
              </span>
            )}
          </div>
        </>
      )}

      <div className="mt-6 rounded-md border border-grey-200 bg-grey-0 p-3">
        <div className="mb-2 text-caption text-grey-500" title={series.data?.definition}>
          Schools active per day · last 30 days
        </div>
        {series.isPending && <Skeleton height={180} className="w-full" />}
        {series.isError && (
          <ErrorState
            message={series.error instanceof Error ? series.error.message : 'Series failed'}
            onRetry={() => void series.refetch()}
          />
        )}
        {series.isSuccess && (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series.data.data}>
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(d: string) => d.slice(5)}
                  minTickGap={24}
                />
                {/* allowDecimals=false: a count of schools is never 2.5. */}
                <YAxis width={32} tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="activeSchools"
                  name="Active schools"
                  stroke="rgb(27 94 156)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <section className="mt-8">
        <h2 className="text-label text-grey-700">At-risk schools</h2>
        <div className="mt-2 overflow-hidden rounded-md border border-grey-200 bg-grey-0">
          {alerts.isPending && <Skeleton height={80} className="m-4 w-auto" />}
          {alerts.isSuccess && alertRows.length === 0 && (
            <p className="p-4 text-body-small text-grey-500">No school is at risk today.</p>
          )}
          {alertRows.map((a) => (
            <ListRow
              key={a.tenantId}
              title={a.name}
              subtitle={
                a.riskReasons?.length
                  ? `${a.band} · ${a.riskReasons.join(', ')}`
                  : `${a.band} · health ${a.score}`
              }
            />
          ))}
        </div>
      </section>
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import {
  Card,
  DataTable,
  ErrorState,
  formatIndianMoney,
  SectionHeader,
  Skeleton,
  StatTile,
  type DataTableColumn,
} from '@saw/ui';
import { apiFetch } from '../lib/api';

/** Matches PlatformService.revenue(). */
type Revenue = {
  mrrPaise: number;
  arrPaise: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  byPlan: Array<{
    status: string;
    amountPaise: number;
    billedStudentCount: number | null;
    planCode: string;
    planTier: string;
  }>;
};

/** Matches PlatformService.costToServe(). */
type CostRow = {
  tenantId: string;
  name: string;
  smsCostPaise: number;
  storageBytes: number;
  egressBytes: number;
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

const costColumns: DataTableColumn<CostRow>[] = [
  { id: 'name', header: 'School', cell: (r) => r.name },
  {
    id: 'sms',
    header: 'SMS cost (30d)',
    numeric: true,
    cell: (r) => formatIndianMoney(r.smsCostPaise),
  },
  { id: 'storage', header: 'Storage', numeric: true, cell: (r) => formatBytes(r.storageBytes) },
  {
    id: 'egress',
    header: 'Egress (30d)',
    numeric: true,
    cell: (r) => formatBytes(r.egressBytes),
  },
];

export function BillingPage() {
  const revenue = useQuery({
    queryKey: ['platform', 'revenue'],
    queryFn: () => apiFetch<Revenue>('/platform/revenue'),
  });
  const cost = useQuery({
    queryKey: ['platform', 'cost-to-serve'],
    queryFn: () =>
      apiFetch<{ data: CostRow[]; windowDays: number }>('/platform/cost-to-serve'),
  });

  if (revenue.isPending || cost.isPending) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton height={40} className="w-48" />
        <div className="grid gap-3 sm:grid-cols-4">
          <Skeleton height={96} />
          <Skeleton height={96} />
          <Skeleton height={96} />
          <Skeleton height={96} />
        </div>
        <Skeleton height={260} className="w-full" />
      </div>
    );
  }

  if (revenue.isError) {
    return (
      <ErrorState
        message={revenue.error instanceof Error ? revenue.error.message : 'Could not load revenue'}
        onRetry={() => void revenue.refetch()}
      />
    );
  }

  const r = revenue.data!;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1 text-grey-900">Billing</h1>

      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="MRR" value={formatIndianMoney(r.mrrPaise, false)} />
        <StatTile label="ARR" value={formatIndianMoney(r.arrPaise, false)} />
        <StatTile label="Active subscriptions" value={String(r.activeSubscriptions)} />
        <StatTile label="On trial" value={String(r.trialSubscriptions)} />
      </div>

      <section>
        <SectionHeader title="By plan" />
        <Card padding={false}>
          <table className="w-full text-left text-body-small">
            <thead>
              <tr className="border-b border-grey-100 text-label text-grey-500">
                <th className="px-4 py-2">Plan</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Students billed</th>
                <th className="px-4 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {r.byPlan.map((row, i) => (
                <tr key={i} className="border-b border-grey-100 last:border-b-0">
                  <td className="px-4 py-2">{row.planTier}</td>
                  <td className="px-4 py-2 capitalize text-grey-600">{row.status}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {row.billedStudentCount ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatIndianMoney(row.amountPaise)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section>
        <SectionHeader
          title="Cost to serve"
          overline={`LAST ${cost.data?.windowDays ?? 30} DAYS`}
        />
        {cost.isError ? (
          <ErrorState
            message={
              cost.error instanceof Error ? cost.error.message : 'Could not load cost data'
            }
            onRetry={() => void cost.refetch()}
          />
        ) : (
          <DataTable
            columns={costColumns}
            rows={cost.data?.data ?? []}
            rowKey={(r) => r.tenantId}
          />
        )}
      </section>
    </div>
  );
}

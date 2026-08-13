import { useQuery } from '@tanstack/react-query';
import { EmptyState, Skeleton, ListRow, MoneyText } from '@saw/ui';
import { ChildSwitcher } from '../components/ChildSwitcher';
import { PaywallOrError } from '../components/PaywallOrError';
import { apiFetch } from '../lib/api';
import { useSelectedChild } from '../lib/use-selected-child';

/** Matches FeesService.familyFeesOverview(). */
type FeesDto = {
  outstandingPaise: number;
  invoices: Array<{
    id: string;
    termName: string;
    dueLabel: string;
    amountPaise: number;
    status: string;
  }>;
};

export function FeesPage() {
  const { children, studentId, setSelectedChildId } = useSelectedChild();

  const fees = useQuery({
    queryKey: ['family', 'fees', studentId],
    queryFn: () =>
      apiFetch<FeesDto>(`/family/fees?studentId=${encodeURIComponent(studentId!)}`),
    enabled: !!studentId,
  });

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-h1 text-grey-900">Fees</h1>
          <p className="mt-1 text-body-small text-grey-600">
            Pay online or view invoices. Amounts are in Indian Rupees.
          </p>
        </div>
        <ChildSwitcher
          children={children}
          selectedId={studentId}
          onSelect={setSelectedChildId}
        />
      </div>

      <div className="mt-6">
        {!studentId && <Skeleton height={160} className="w-full" />}
        {studentId && fees.isPending && <Skeleton height={160} className="w-full" />}
        {fees.isError && (
          <PaywallOrError
            error={fees.error}
            children={children}
            highlightId={studentId}
            fallback="Could not load fees"
            onRetry={() => void fees.refetch()}
          />
        )}
        {fees.isSuccess && (
          <div className="space-y-4">
            <div className="rounded-md border border-grey-200 bg-grey-0 p-4">
              <div
                className={[
                  'text-numeric-large tabular-nums',
                  fees.data.outstandingPaise > 0 ? 'text-red-500' : 'text-green-500',
                ].join(' ')}
              >
                <MoneyText paise={fees.data.outstandingPaise} />
              </div>
              <p className="mt-1 text-caption text-grey-500">Total outstanding</p>
            </div>

            {fees.data.invoices.length === 0 ? (
              <EmptyState headline="No invoices" body="Open fee invoices will list here." />
            ) : (
              <div className="overflow-hidden rounded-md border border-grey-200 bg-grey-0">
                {fees.data.invoices.map((row) => (
                  <ListRow
                    key={row.id}
                    title={row.termName}
                    subtitle={`${row.dueLabel} · ${row.status}`}
                    trailing={<MoneyText paise={row.amountPaise} />}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

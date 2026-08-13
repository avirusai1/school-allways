import type { ImportStatus } from './import.types';

type Props = {
  status: ImportStatus | undefined;
  entityLabel: string;
};

export function ImportProgress({ status, entityLabel }: Props) {
  const pct = Math.min(100, Math.max(0, status?.progressPct ?? 0));
  const committed = status?.committedRows ?? 0;
  const total = status?.validRows || status?.totalRows || 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-numeric-large text-grey-900">
          {committed.toLocaleString('en-IN')} of {total.toLocaleString('en-IN')}
        </p>
        <p className="mt-1 text-body-small text-grey-600">
          Importing {entityLabel}… You can leave this page and come back.
        </p>
      </div>

      <div
        className="h-2 w-full overflow-hidden rounded-sm bg-grey-100"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-blue-500 transition-[width] duration-fast ease-standard"
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="rounded-sm border border-blue-100 bg-blue-50 px-3 py-2 text-body-small text-blue-700">
        Progress continues in the background. Open Imports anytime to check status
        or undo within 24 hours.
      </p>
    </div>
  );
}

import { useMemo } from 'react';
import { Button, DataTable, type DataTableColumn } from '@saw/ui';
import type { ValidationErrorItem, ValidationResult } from './import.types';

type Props = {
  result: ValidationResult;
  onBack: () => void;
  onImport: () => void;
  onDownloadErrors: () => void;
  busy?: boolean;
};

export function ValidationReport({
  result,
  onBack,
  onImport,
  onDownloadErrors,
  busy,
}: Props) {
  const columns = useMemo<DataTableColumn<ValidationErrorItem>[]>(
    () => [
      {
        id: 'row',
        header: 'Row',
        numeric: true,
        width: 64,
        cell: (r) => r.row,
      },
      {
        id: 'column',
        header: 'Column',
        cell: (r) => r.column,
      },
      {
        id: 'value',
        header: 'Value',
        cell: (r) => r.value || '—',
      },
      {
        id: 'message',
        header: "What's wrong",
        // Render API message verbatim — never substitute a generic string.
        cell: (r) => r.message,
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-md border border-grey-200 bg-grey-25 px-4 py-3">
        <p className="text-body text-grey-900">
          {result.totalRows.toLocaleString('en-IN')} rows checked
        </p>
        <p className="mt-1 text-body-small text-grey-700">
          <span className="text-green-700">
            {result.validRows.toLocaleString('en-IN')} ready to import
          </span>
          {' · '}
          <span className="text-red-600">
            {result.errorRows.toLocaleString('en-IN')} need fixing
          </span>
        </p>
      </div>

      {result.errors.length > 0 ? (
        <DataTable
          columns={columns}
          rows={result.errors}
          rowKey={(r) => `${r.row}-${r.column}-${r.message}`}
          density="compact"
          virtualizeAbove={100}
          maxHeight={400}
        />
      ) : (
        <p className="text-body-small text-grey-700">
          Every row looks good. You can import the full file.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onBack} disabled={busy}>
            Back
          </Button>
          {result.errorRows > 0 ? (
            <Button variant="ghost" onClick={onDownloadErrors} disabled={busy}>
              Download error rows as Excel
            </Button>
          ) : null}
        </div>
        <Button
          variant="primary"
          onClick={onImport}
          loading={busy}
          disabled={result.validRows === 0}
        >
          Import {result.validRows.toLocaleString('en-IN')} rows →
        </Button>
      </div>
    </div>
  );
}

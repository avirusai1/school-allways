import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Icon,
  Select,
  Skeleton,
  UploadSimple,
} from '@saw/ui';
import { ColumnMapper } from './ColumnMapper';
import { ImportProgress } from './ImportProgress';
import { ValidationReport } from './ValidationReport';
import {
  downloadErrorRows,
  downloadTemplate,
  useImportActions,
  useImportStatus,
} from './useImport';
import type {
  ColumnMapping,
  ImportEntity,
  ImportVendor,
  SuggestedMapping,
  ValidationResult,
  WizardPhase,
} from './import.types';

type Props = {
  branchId: string;
  entity: ImportEntity;
  /** Omitted in the wizard, where the onboarding step fixes the entity. */
  onEntityChange?: (entity: ImportEntity) => void;
  /**
   * 'wizard' drops the page header and the links that would navigate out of
   * the onboarding flow. Everything else — all five phases — is identical.
   */
  variant?: 'page' | 'wizard';
  /** Fires once when a commit finishes, so the wizard can report a row count. */
  onCommitted?: (result: { committedRows: number; errorRows: number }) => void;
};

const VENDOR_OPTIONS = [
  { value: 'generic', label: 'Excel / CSV' },
  { value: 'entab', label: 'Entab' },
  { value: 'teachmint', label: 'Teachmint' },
  { value: 'myclassboard', label: 'MyClassboard' },
];

const STEP_LABEL: Record<WizardPhase, string> = {
  upload: 'Step 1 of 5',
  mapping: 'Step 2 of 5',
  validation: 'Step 3 of 5',
  progress: 'Step 4 of 5',
  result: 'Step 5 of 5',
};

export function ImportWizard({
  branchId,
  entity,
  onEntityChange,
  variant = 'page',
  onCommitted,
}: Props) {
  const embedded = variant === 'wizard';
  const actions = useImportActions(branchId);
  const [phase, setPhase] = useState<WizardPhase>('upload');
  const [vendor, setVendor] = useState<ImportVendor>('generic');
  const [importId, setImportId] = useState<string | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [suggested, setSuggested] = useState<SuggestedMapping>({});
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [undoOpen, setUndoOpen] = useState(false);

  const statusQuery = useImportStatus(
    importId,
    phase === 'progress' || phase === 'result',
  );
  const status = statusQuery.data;

  useEffect(() => {
    if (
      phase === 'progress' &&
      (status?.status === 'committed' || status?.status === 'failed')
    ) {
      setPhase('result');
      if (status?.status === 'committed') {
        onCommitted?.({
          committedRows: status.committedRows,
          errorRows: status.errorRows,
        });
      }
    }
  }, [phase, status?.status, status?.committedRows, status?.errorRows, onCommitted]);

  const entityLabel = entity === 'staff' ? 'staff' : 'students';
  const busy =
    actions.upload.isPending ||
    actions.mapColumns.isPending ||
    actions.validate.isPending ||
    actions.commit.isPending;

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    setLocalError(null);
    try {
      const res = await actions.upload.mutateAsync({ file, entity, vendor });
      setImportId(res.importId);
      setColumns(res.detectedColumns);
      setSuggested(res.suggestedMapping);
      const initial: ColumnMapping = {};
      for (const col of res.detectedColumns) {
        initial[col] = res.suggestedMapping[col]?.field ?? 'skip';
      }
      setMapping(initial);
      setPhase('mapping');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Upload failed');
    }
  }

  async function handleValidate() {
    if (!importId) return;
    setLocalError(null);
    try {
      await actions.mapColumns.mutateAsync({ importId, mapping, vendor });
      const result = await actions.validate.mutateAsync(importId);
      setValidation(result);
      setPhase('validation');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Validation failed');
    }
  }

  async function handleCommit() {
    if (!importId) return;
    setLocalError(null);
    try {
      await actions.commit.mutateAsync({ importId, partialCommit: true });
      setPhase('progress');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Import failed to start');
    }
  }

  function resetWizard() {
    setPhase('upload');
    setImportId(null);
    setValidation(null);
    setColumns([]);
    setMapping({});
    setSuggested({});
  }

  return (
    <div className="flex flex-col gap-6">
      {embedded ? (
        <p className="text-body-small text-grey-600">
          {STEP_LABEL[phase]} · Partial import is the default — good rows go through
          even if some need fixing.
        </p>
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-overline uppercase text-grey-600">{STEP_LABEL[phase]}</p>
            <h1 className="mt-1 text-h1 text-grey-900">Import {entityLabel}</h1>
            <p className="mt-1 text-body-small text-grey-600">
              Partial import is the default — good rows go through even if some need
              fixing.
            </p>
          </div>
          {phase === 'upload' && onEntityChange ? (
            <Select
              label="Importing"
              className="w-44"
              value={entity}
              onChange={(e) => onEntityChange(e.target.value as ImportEntity)}
              options={[
                { value: 'students', label: 'Students' },
                { value: 'staff', label: 'Staff' },
              ]}
            />
          ) : null}
        </div>
      )}

      {localError ? (
        <ErrorState message={localError} onRetry={() => setLocalError(null)} />
      ) : null}

      {phase === 'upload' ? (
        <div className="flex flex-col gap-6">
          <label
            className={[
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed px-6 py-10',
              dragOver ? 'border-blue-500 bg-blue-50' : 'border-grey-300 bg-grey-25',
            ].join(' ')}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void handleFile(e.dataTransfer.files?.[0]);
            }}
          >
            <span className="text-grey-400">
              <Icon icon={UploadSimple} size="empty" />
            </span>
            <span className="text-body text-grey-900">Drag your file here, or browse</span>
            <span className="text-body-small text-grey-600">
              .xlsx, .xls or .csv · up to 10 MB
            </span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="sr-only"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
          </label>

          <div className="flex items-center gap-3 text-body-small text-grey-500">
            <span className="h-px flex-1 bg-grey-200" />
            or
            <span className="h-px flex-1 bg-grey-200" />
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <Button variant="outline" onClick={() => void downloadTemplate(entity)}>
              Download our template
            </Button>
            <Select
              label="I'm moving from…"
              className="min-w-[220px]"
              value={vendor}
              onChange={(e) => setVendor(e.target.value as ImportVendor)}
              options={VENDOR_OPTIONS}
              hint="Sets the column mapper for your previous system."
            />
          </div>

          {actions.upload.isPending ? <Skeleton height={48} className="w-full" /> : null}
        </div>
      ) : null}

      {phase === 'mapping' ? (
        <ColumnMapper
          entity={entity}
          columns={columns}
          suggested={suggested}
          mapping={mapping}
          onChange={setMapping}
          onBack={() => setPhase('upload')}
          onValidate={() => void handleValidate()}
          busy={busy}
        />
      ) : null}

      {phase === 'validation' && validation ? (
        <ValidationReport
          result={validation}
          onBack={() => setPhase('mapping')}
          onImport={() => void handleCommit()}
          onDownloadErrors={() => {
            if (importId) void downloadErrorRows(importId);
          }}
          busy={busy}
        />
      ) : null}

      {phase === 'progress' ? (
        statusQuery.isPending && !status ? (
          <Skeleton height={120} className="w-full" />
        ) : (
          <ImportProgress status={status} entityLabel={entityLabel} />
        )
      ) : null}

      {phase === 'result' ? (
        <div className="flex flex-col gap-6">
          {statusQuery.isError ? (
            <ErrorState
              message={
                statusQuery.error instanceof Error
                  ? statusQuery.error.message
                  : 'Could not load import status. Try again in a moment.'
              }
              onRetry={() => void statusQuery.refetch()}
            />
          ) : null}

          {status?.status === 'committed' ? (
            <>
              <div className="rounded-md border border-grey-200 bg-grey-25 px-4 py-4">
                <p className="text-h3 text-grey-900">
                  {status.committedRows.toLocaleString('en-IN')} {entityLabel} imported
                </p>
                {status.errorRows > 0 ? (
                  <p className="mt-1 text-body-small text-grey-700">
                    {status.errorRows.toLocaleString('en-IN')} rows skipped ·{' '}
                    <button
                      type="button"
                      className="font-medium text-blue-600 hover:underline"
                      onClick={() => {
                        if (importId) void downloadErrorRows(importId);
                      }}
                    >
                      Download skipped rows
                    </button>
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-3">
                {embedded ? null : (
                  <Link
                    to={entity === 'staff' ? '/staff' : '/students'}
                    className="inline-flex h-12 items-center rounded-md bg-blue-500 px-5 text-body font-semibold text-grey-0 hover:bg-blue-600"
                  >
                    View {entityLabel}
                  </Link>
                )}
                <Button variant="outline" onClick={() => setUndoOpen(true)}>
                  Undo this import
                </Button>
                <Button variant="ghost" onClick={resetWizard}>
                  Import another file
                </Button>
              </div>
            </>
          ) : null}

          {status?.status === 'failed' ? (
            <EmptyState
              headline="Import failed"
              body="Nothing was committed. Fix the file and try again, or download the error rows."
              actionLabel="Start over"
              onAction={resetWizard}
            />
          ) : null}

          {!status && statusQuery.isPending ? (
            <Skeleton height={120} className="w-full" />
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={undoOpen}
        onClose={() => setUndoOpen(false)}
        danger
        title={`Remove all ${(status?.committedRows ?? 0).toLocaleString('en-IN')} ${entityLabel} imported in this batch?`}
        body="Undo restores the exact prior state. This cannot be reversed after you confirm."
        confirmLabel="Undo import"
        loading={actions.undo.isPending}
        onConfirm={() => {
          if (!importId) return;
          void actions.undo.mutateAsync(importId).then(() => {
            setUndoOpen(false);
            resetWizard();
          });
        }}
      />
    </div>
  );
}

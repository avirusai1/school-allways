import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Skeleton,
  SkeletonList,
} from '@saw/ui';
import { ImportWizard } from '../features/import/ImportWizard';
import {
  undoStillAvailable,
  type ImportEntity,
} from '../features/import/import.types';
import { useImportActions, useImportBatches } from '../features/import/useImport';
import { useAuth } from '../lib/auth';

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ImportPage() {
  const { id } = useParams<{ id?: string }>();
  const { session } = useAuth();
  const branchId = session?.branch?.id;
  const [entity, setEntity] = useState<ImportEntity>('students');
  const [undoId, setUndoId] = useState<string | null>(null);
  const [undoCount, setUndoCount] = useState(0);
  const [undoEntity, setUndoEntity] = useState<ImportEntity>('students');

  const batches = useImportBatches(branchId);
  const { undo } = useImportActions(branchId);

  if (!branchId) {
    return (
      <EmptyState
        headline="No branch selected"
        body="Choose a branch in your session before importing."
      />
    );
  }

  const list = batches.data ?? [];

  return (
    <div className="flex flex-col gap-8">
      <ImportWizard
        branchId={branchId}
        entity={entity}
        onEntityChange={setEntity}
      />

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-h3 text-grey-900">Recent imports</h2>
          <p className="mt-1 text-body-small text-grey-600">
            Undo stays visible for 24 hours — not hidden in a menu.
          </p>
        </div>

        {batches.isPending ? <SkeletonList count={4} /> : null}

        {batches.isError ? (
          <ErrorState
            message={
              batches.error instanceof Error
                ? batches.error.message
                : 'Could not load imports. Try again in a moment.'
            }
            onRetry={() => void batches.refetch()}
          />
        ) : null}

        {!batches.isPending && !batches.isError && list.length === 0 ? (
          <EmptyState
            headline="No imports yet"
            body="Upload a spreadsheet above. You can undo within 24 hours after a successful import."
          />
        ) : null}

        {list.length > 0 ? (
          <ul className="divide-y divide-grey-200 rounded-md border border-grey-200">
            {list.map((batch) => {
              const canUndo =
                batch.status === 'committed' && undoStillAvailable(batch.committedAt);
              return (
                <li
                  key={batch.id}
                  className={[
                    'flex flex-wrap items-center justify-between gap-3 px-4 py-3',
                    id === batch.id ? 'bg-blue-50' : 'bg-grey-0',
                  ].join(' ')}
                >
                  <div>
                    <p className="text-body font-medium text-grey-900">
                      {batch.entity === 'staff' ? 'Staff' : 'Students'} ·{' '}
                      {batch.status}
                    </p>
                    <p className="mt-0.5 text-body-small text-grey-600">
                      {batch.committedRows.toLocaleString('en-IN')} committed
                      {batch.errorRows > 0
                        ? ` · ${batch.errorRows.toLocaleString('en-IN')} skipped`
                        : ''}
                      {' · '}
                      {formatWhen(batch.committedAt ?? batch.createdAt)}
                    </p>
                  </div>
                  {canUndo ? (
                    <Button
                      variant="outline"
                      size="compact"
                      onClick={() => {
                        setUndoId(batch.id);
                        setUndoCount(batch.committedRows);
                        setUndoEntity(batch.entity);
                      }}
                    >
                      Undo
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}

        {batches.isPending && list.length === 0 ? (
          <Skeleton height={120} className="w-full" />
        ) : null}
      </section>

      <ConfirmDialog
        open={Boolean(undoId)}
        onClose={() => setUndoId(null)}
        danger
        title={`Remove all ${undoCount.toLocaleString('en-IN')} ${undoEntity} imported in this batch?`}
        body="Undo restores the exact prior state."
        confirmLabel="Undo import"
        loading={undo.isPending}
        onConfirm={() => {
          if (!undoId) return;
          void undo.mutateAsync(undoId).then(() => setUndoId(null));
        }}
      />
    </div>
  );
}

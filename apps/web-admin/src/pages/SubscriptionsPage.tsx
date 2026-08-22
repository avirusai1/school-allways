import { useMemo, useState } from 'react';
import {
  Button,
  Card,
  Chip,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Skeleton,
  TextField,
  formatIndianMoney,
} from '@saw/ui';
import { useAuth } from '../lib/auth';
import { useClasses, useSections, useSessions } from '../features/academic/useAcademic';
import {
  useManualActivate,
  useSubscriptionList,
} from '../features/subscriptions/useSubscriptions';

export function SubscriptionsPage() {
  const { session } = useAuth();
  const branchId = session?.branch?.id;
  const [q, setQ] = useState('');
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionsQ = useSessions(branchId);
  const current = sessionsQ.data?.find((s) => s.isCurrent) ?? sessionsQ.data?.[0];
  const classesQ = useClasses(branchId);
  const sectionsQ = useSections(branchId, current?.id);

  const listQ = useSubscriptionList({
    q,
    classId: classId || undefined,
    sectionId: sectionId || undefined,
  });
  const activate = useManualActivate();

  const rows = useMemo(() => listQ.data?.data ?? [], [listQ.data?.data]);
  const locked = rows.filter((r) => !r.subscribed);
  const selectedLocked = locked.filter((r) => selected.has(r.id));
  const amountPaise = listQ.data?.meta.amountPaise ?? 36500;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllLocked() {
    setSelected((prev) =>
      prev.size === locked.length ? new Set() : new Set(locked.map((r) => r.id)),
    );
  }

  async function confirmActivate() {
    setError(null);
    try {
      await activate.mutateAsync(selectedLocked.map((r) => ({ studentId: r.id })));
      setSelected(new Set());
      setConfirmOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not activate subscriptions.');
    }
  }

  if (!branchId) {
    return <EmptyState headline="No branch" body="Choose a branch first." />;
  }

  if (listQ.isPending) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton height={40} className="w-72" />
        <Skeleton height={240} />
      </div>
    );
  }

  if (listQ.isError) {
    return (
      <ErrorState
        message="Could not load subscription status."
        onRetry={() => void listQ.refetch()}
      />
    );
  }

  const invoicePaise = selectedLocked.length * amountPaise;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h1 text-grey-900">Parent subscriptions</h1>
        <p className="mt-1 text-body-small text-grey-600">
          ₹365 per student per session, GST included. Mark a student paid only after you have
          collected the cash — School All Ways will invoice the school for each activation.
        </p>
      </div>

      {listQ.data?.meta.inGrace ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-body-small text-amber-900">
          Grace period is on
          {listQ.data.meta.graceEndsAt
            ? ` until ${new Date(listQ.data.meta.graceEndsAt).toLocaleDateString('en-IN')}`
            : ''}
          . Parents can use the app until then even if they have not paid.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-body-small text-red-800">
          {error}
        </p>
      ) : null}

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <TextField
          label="Search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name or admission no."
        />
        <label className="flex flex-col gap-1 text-caption text-grey-600">
          Class
          <select
            className="h-10 rounded-md border border-grey-200 px-2 text-body-small"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setSectionId('');
            }}
          >
            <option value="">All</option>
            {(classesQ.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-caption text-grey-600">
          Section
          <select
            className="h-10 rounded-md border border-grey-200 px-2 text-body-small"
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
          >
            <option value="">All</option>
            {(sectionsQ.data ?? [])
              .filter((s) => !classId || s.classId === classId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={toggleAllLocked} disabled={locked.length === 0}>
          {selected.size === locked.length && locked.length > 0 ? 'Clear selection' : 'Select unpaid'}
        </Button>
        <Button
          onClick={() => setConfirmOpen(true)}
          disabled={selectedLocked.length === 0 || activate.isPending}
        >
          Mark as paid (cash collected)
        </Button>
        <span className="text-body-small text-grey-600">
          {selectedLocked.length} selected · {formatIndianMoney(invoicePaise, false)} to invoice
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState headline="No students" body="No students match these filters." />
      ) : (
        <div className="overflow-hidden rounded-md bg-surface-container-low">
          {rows.map((row) => (
            <label
              key={row.id}
              className="flex items-center gap-3 border-b border-grey-100 px-4 py-3 last:border-b-0"
            >
              <input
                type="checkbox"
                disabled={row.subscribed}
                checked={selected.has(row.id)}
                onChange={() => toggle(row.id)}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-grey-900">{row.fullName}</span>
                <span className="block text-[12px] text-grey-500">
                  {row.admissionNo}
                  {row.classLabel ? ` · ${row.classLabel}` : ''}
                </span>
              </span>
              <Chip
                label={
                  row.status === 'grace'
                    ? 'Grace'
                    : row.status === 'active'
                      ? 'Active'
                      : 'Locked'
                }
                tone={row.status === 'locked' ? 'danger' : 'success'}
              />
            </label>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void confirmActivate()}
        title={`You are activating ${selectedLocked.length} subscriptions. School All Ways will invoice your school ${formatIndianMoney(invoicePaise, false)} for these. Continue?`}
        body="Only mark students paid after the cash is in hand. Already-subscribed students are skipped."
        confirmLabel="Activate and accept invoice"
        loading={activate.isPending}
        danger
      />
    </div>
  );
}

import { useMemo, useState } from 'react';
import {
  Button,
  Card,
  CheckCircle,
  Dialog,
  EmptyState,
  ErrorState,
  Icon,
  SectionHeader,
  Skeleton,
  formatIndianMoney,
} from '@saw/ui';

import {
  useApprovalInbox,
  useDecide,
  type ApprovalGroup,
  type ApprovalItem,
  type ApprovalType,
} from '../features/approvals/useApprovals';

type Pending = {
  type: ApprovalType;
  ids: string[];
  action: 'approve' | 'reject';
  label: string;
};

export function ApprovalsPage() {
  const query = useApprovalInbox();
  const decide = useDecide();

  /** Selection is per group: the endpoints are per type, and so is the intent. */
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState('');

  // Memoising on `query.data?.groups` rather than a defaulted local: `?? []`
  // builds a new array every render, which would defeat the memo entirely.
  const groups = useMemo(() => query.data?.groups ?? [], [query.data?.groups]);
  const actionable = useMemo(() => groups.filter((g) => g.items.length > 0), [groups]);

  function toggle(type: ApprovalType, id: string) {
    setSelected((prev) => {
      const next = new Set(prev[type] ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, [type]: next };
    });
  }

  function toggleAll(group: ApprovalGroup) {
    setSelected((prev) => {
      const current = prev[group.type] ?? new Set<string>();
      const all = current.size === group.items.length;
      return {
        ...prev,
        [group.type]: all
          ? new Set<string>()
          : new Set(group.items.map((i) => i.id)),
      };
    });
  }

  function ask(
    type: ApprovalType,
    ids: string[],
    action: 'approve' | 'reject',
    label: string,
  ) {
    setReason('');
    setPending({ type, ids, action, label });
  }

  async function confirm() {
    if (!pending) return;
    await decide.mutateAsync({
      type: pending.type,
      ids: pending.ids,
      action: pending.action,
      reason: pending.action === 'reject' ? reason.trim() : undefined,
    });
    setSelected((prev) => ({ ...prev, [pending.type]: new Set<string>() }));
    setPending(null);
  }

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton height={40} className="w-56" />
        <Skeleton height={200} />
        <Skeleton height={160} />
      </div>
    );
  }

  if (query.isError) {
    return (
      <ErrorState
        message="The approvals inbox could not be loaded."
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        headline="Nothing to approve"
        body="Leave, fee concessions and circulars that need a decision appear here. You may not have approval rights for any of them yet."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h1 text-grey-900">Approvals</h1>
        <p className="mt-1 text-body-small text-grey-600">
          {query.data.total === 0
            ? 'Nothing is waiting for a decision.'
            : `${query.data.total} item${query.data.total === 1 ? '' : 's'} waiting for a decision.`}
        </p>
      </div>

      {actionable.length === 0 ? (
        <Card>
          <div className="flex items-center gap-3 py-4">
            <Icon icon={CheckCircle} size="inline" className="text-green-500" />
            <p className="text-body text-grey-900">
              Your queue is clear. New requests land here as they are raised.
            </p>
          </div>
        </Card>
      ) : null}

      {actionable.map((group) => {
        const chosen = selected[group.type] ?? new Set<string>();
        const allChosen = chosen.size === group.items.length;

        return (
          <section key={group.type}>
            <SectionHeader
              title={`${group.label} (${group.count})`}
              action={
                group.canDecide ? (
                  <button
                    type="button"
                    onClick={() => toggleAll(group)}
                    className="text-body-small text-blue-500 hover:underline"
                  >
                    {allChosen ? 'Clear selection' : 'Select all'}
                  </button>
                ) : undefined
              }
            />

            <Card padding={false}>
              <ul>
                {group.items.map((item) => (
                  <ApprovalRow
                    key={item.id}
                    item={item}
                    canDecide={group.canDecide}
                    checked={chosen.has(item.id)}
                    onToggle={() => toggle(group.type, item.id)}
                    onApprove={() =>
                      ask(group.type, [item.id], 'approve', item.subject)
                    }
                    onReject={() =>
                      ask(group.type, [item.id], 'reject', item.subject)
                    }
                  />
                ))}
              </ul>

              {chosen.size > 0 ? (
                <div className="flex items-center justify-between gap-4 border-t border-grey-200 bg-grey-25 px-4 py-3">
                  <span className="text-body-small text-grey-700">
                    {chosen.size} selected
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="inline"
                      onClick={() =>
                        ask(
                          group.type,
                          [...chosen],
                          'reject',
                          `${chosen.size} ${group.label.toLowerCase()}`,
                        )
                      }
                    >
                      Reject
                    </Button>
                    <Button
                      variant="secondary"
                      size="inline"
                      onClick={() =>
                        ask(
                          group.type,
                          [...chosen],
                          'approve',
                          `${chosen.size} ${group.label.toLowerCase()}`,
                        )
                      }
                    >
                      Approve
                    </Button>
                  </div>
                </div>
              ) : null}
            </Card>
          </section>
        );
      })}

      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title={
          pending?.action === 'approve' ? 'Approve request' : 'Reject request'
        }
        description={
          pending
            ? pending.action === 'approve'
              ? `${pending.label} will be approved and the person who asked will be told.`
              : `${pending.label} will be rejected. Your reason is shown to them.`
            : undefined
        }
        footer={
          <>
            <Button
              variant="outline"
              size="compact"
              onClick={() => setPending(null)}
            >
              Cancel
            </Button>
            <Button
              variant={pending?.action === 'approve' ? 'secondary' : 'danger'}
              size="compact"
              loading={decide.isPending}
              disabled={pending?.action === 'reject' && reason.trim().length === 0}
              onClick={() => void confirm()}
            >
              {pending?.action === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </>
        }
      >
        {pending?.action === 'reject' ? (
          <label className="block">
            <span className="text-body-small text-grey-700">Reason</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Peak exam week — please reapply for a later date."
              className="mt-1 w-full rounded-sm border border-grey-300 px-3 py-2 text-body text-grey-900 placeholder:text-grey-400 focus:border-blue-500 focus:outline-none"
            />
          </label>
        ) : null}

        {decide.isError ? (
          <p className="mt-3 text-body-small text-red-700">
            {decide.error instanceof Error
              ? decide.error.message
              : 'That could not be saved.'}
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}

function ApprovalRow({
  item,
  canDecide,
  checked,
  onToggle,
  onApprove,
  onReject,
}: {
  item: ApprovalItem;
  canDecide: boolean;
  checked: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <li className="flex items-start gap-3 border-b border-grey-100 px-4 py-3 last:border-b-0">
      {canDecide ? (
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          aria-label={`Select ${item.subject}`}
          className="mt-1 h-4 w-4 shrink-0 accent-blue-500"
        />
      ) : null}

      <div className="min-w-0 flex-1">
        <p className="text-body-medium text-grey-900">
          {item.subject}
          {item.detail ? (
            <span className="text-body text-grey-600"> · {item.detail}</span>
          ) : null}
        </p>
        <p className="text-body-small text-grey-700">
          {item.summary}
          {item.amountPaise ? ` · ${formatIndianMoney(item.amountPaise)}` : ''}
        </p>
        {item.reason ? (
          <p className="mt-1 text-body-small italic text-grey-600">
            “{item.reason}”
          </p>
        ) : null}
      </div>

      {canDecide ? (
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="inline" onClick={onReject}>
            Reject
          </Button>
          <Button variant="secondary" size="inline" onClick={onApprove}>
            Approve
          </Button>
        </div>
      ) : null}
    </li>
  );
}

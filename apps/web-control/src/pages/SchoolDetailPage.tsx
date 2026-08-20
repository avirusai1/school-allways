import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Chip, ErrorState, ListRow, Skeleton, StatTile, formatIndianMoney } from '@saw/ui';
import { apiFetch } from '../lib/api';

/**
 * Matches `/platform/schools/:id`. Everything here is a count, a score or a
 * money total — per the privacy rule at the top of db/schema/15-platform.ts
 * this console must never render a student, guardian or staff identity.
 */
type SchoolDetail = {
  tenant: {
    id: string;
    name: string;
    slug: string;
    status: string;
    planTier: string;
    onboardingStep: string | null;
    onboardingCompletedAt: string | null;
    activatedAt: string | null;
    createdAt: string;
  };
  health: {
    band: string;
    score: number;
    activationScore: number;
    engagementScore: number;
    adoptionScore: number;
    riskReasons: string[] | null;
    daysSinceLastAttendance: number | null;
  } | null;
  metrics: {
    day: string;
    studentCount: number;
    staffCount: number;
    guardianCount: number;
    attendanceRegistersMarked: number;
    attendanceRegistersExpected: number;
    feesCollectedPaise: number;
    feesOutstandingPaise: number;
    smsCostPaise: number;
    storageBytes: number;
  } | null;
  supportSessions: { id: string; reason: string; startedAt: string; endedAt: string | null }[];
  billing?: {
    sessionName: string | null;
    manual: {
      count: number;
      billedCount: number;
      unbilledCount: number;
      owedPaise: number;
      unbilledPaise: number;
    };
    play: { count: number };
    complimentary: { count: number };
    stayConnected: {
      status: string;
      totalPaise: number;
      dueDate: string;
      paidAt: string | null;
      invoiceNumber: string | null;
    } | null;
    invoices: Array<{
      id: string;
      invoiceNumber: string;
      kind: string;
      totalPaise: number;
      issuedAt: string;
      status: string;
    }>;
  };
};

const bandTone: Record<string, 'success' | 'info' | 'neutral' | 'warning' | 'danger'> = {
  healthy: 'success',
  activated: 'success',
  onboarding: 'info',
  not_started: 'neutral',
  at_risk: 'warning',
  churning: 'danger',
  dormant: 'danger',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

export function SchoolDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: ['platform', 'schools', id],
    queryFn: () => apiFetch<SchoolDetail>(`/platform/schools/${id}`),
    enabled: Boolean(id),
  });

  const invoice = useMutation({
    mutationFn: (kind: 'manual_activations' | 'stay_connected') =>
      apiFetch(`/platform/schools/${id}/invoices`, {
        method: 'POST',
        body: JSON.stringify({ kind }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['platform', 'schools', id] }),
  });
  const markPaid = useMutation({
    mutationFn: () =>
      apiFetch(`/platform/schools/${id}/stay-connected/paid`, { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['platform', 'schools', id] }),
  });
  const suspend = useMutation({
    mutationFn: (reason: string) =>
      apiFetch(`/platform/schools/${id}/suspend`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['platform', 'schools', id] }),
  });
  const unsuspend = useMutation({
    mutationFn: (reason: string) =>
      apiFetch(`/platform/schools/${id}/unsuspend`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['platform', 'schools', id] }),
  });

  const d = detail.data;
  const marked = d?.metrics
    ? `${d.metrics.attendanceRegistersMarked}/${d.metrics.attendanceRegistersExpected}`
    : '—';

  return (
    <div>
      <h1 className="text-h1 text-grey-900">{d?.tenant.name ?? 'School'}</h1>
      <p className="mt-1 text-body-small text-grey-600">
        Aggregate drill-down only. No student, guardian or staff records are readable here.
      </p>

      {detail.isPending && <Skeleton height={120} className="mt-6 w-full" />}
      {detail.isError && (
        <div className="mt-6">
          <ErrorState
            message={detail.error instanceof Error ? detail.error.message : 'Failed'}
            onRetry={() => void detail.refetch()}
          />
        </div>
      )}

      {d && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Chip label={d.tenant.slug} />
            <Chip label={d.tenant.planTier} tone="accent" />
            <Chip label={d.tenant.status} tone={d.tenant.status === 'active' ? 'success' : d.tenant.status === 'suspended' ? 'danger' : 'info'} />
            {d.health && (
              <Chip
                label={`${d.health.band.replace(/_/g, ' ')} · ${d.health.score}`}
                tone={bandTone[d.health.band] ?? 'neutral'}
              />
            )}
            {!d.tenant.onboardingCompletedAt && (
              <Chip label={`setup: ${d.tenant.onboardingStep ?? 'not started'}`} tone="warning" />
            )}
          </div>

          {d.health ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile label="Activation" value={`${d.health.activationScore}`} caption="of 100" />
              <StatTile label="Engagement" value={`${d.health.engagementScore}`} caption="of 100" />
              <StatTile label="Adoption" value={`${d.health.adoptionScore}`} caption="of 100" />
              <StatTile
                label="Days since attendance"
                value={d.health.daysSinceLastAttendance == null ? '—' : String(d.health.daysSinceLastAttendance)}
              />
            </div>
          ) : (
            <p className="mt-6 rounded-md bg-surface-container-low p-4 text-body-small text-grey-500">
              No health scores yet — they appear after the next rollup.
            </p>
          )}

          {d.health?.riskReasons?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {d.health.riskReasons.map((r) => (
                <Chip key={r} label={r.replace(/_/g, ' ')} tone="warning" />
              ))}
            </div>
          ) : null}

          <h2 className="mt-8 text-label text-grey-700">
            Daily metrics{d.metrics ? ` · ${d.metrics.day}` : ''}
          </h2>
          {d.metrics ? (
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile label="Students" value={String(d.metrics.studentCount)} />
              <StatTile label="Staff" value={String(d.metrics.staffCount)} />
              <StatTile label="Guardians" value={String(d.metrics.guardianCount)} />
              <StatTile label="Registers marked" value={marked} />
              <StatTile
                label="Fees collected"
                value={formatIndianMoney(d.metrics.feesCollectedPaise, false)}
              />
              <StatTile
                label="Fees outstanding"
                value={formatIndianMoney(d.metrics.feesOutstandingPaise, false)}
              />
              <StatTile label="SMS cost" value={formatIndianMoney(d.metrics.smsCostPaise, false)} />
              <StatTile label="Storage" value={formatBytes(d.metrics.storageBytes)} />
            </div>
          ) : (
            <p className="mt-2 rounded-md bg-surface-container-low p-4 text-body-small text-grey-500">
              No metrics recorded yet.
            </p>
          )}

          <h2 className="mt-8 text-label text-grey-700">Billing (counts only)</h2>
          {d.billing ? (
            <div className="mt-2 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile
                  label="Manual activations"
                  value={String(d.billing.manual.count)}
                  caption={`${formatIndianMoney(d.billing.manual.owedPaise, false)} owed`}
                />
                <StatTile
                  label="Unbilled"
                  value={String(d.billing.manual.unbilledCount)}
                  caption={formatIndianMoney(d.billing.manual.unbilledPaise, false)}
                />
                <StatTile
                  label="Play activations"
                  value={String(d.billing.play.count)}
                  caption="Not invoiced by us"
                />
                <StatTile
                  label="Stay Connected"
                  value={d.billing.stayConnected?.status ?? '—'}
                  caption={
                    d.billing.stayConnected
                      ? formatIndianMoney(d.billing.stayConnected.totalPaise, false)
                      : undefined
                  }
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="compact"
                  disabled={d.billing.manual.unbilledCount === 0 || invoice.isPending}
                  onClick={() => invoice.mutate('manual_activations')}
                >
                  Generate invoice (manual)
                </Button>
                <Button
                  size="compact"
                  variant="outline"
                  disabled={!d.billing.stayConnected || Boolean(d.billing.stayConnected.invoiceNumber) || invoice.isPending}
                  onClick={() => invoice.mutate('stay_connected')}
                >
                  Generate invoice (Stay Connected)
                </Button>
                <Button
                  size="compact"
                  variant="outline"
                  disabled={!d.billing.stayConnected || d.billing.stayConnected.status === 'paid' || markPaid.isPending}
                  onClick={() => markPaid.mutate()}
                >
                  Mark Stay Connected paid
                </Button>
              </div>
              {invoice.isError ? (
                <p className="text-body-small text-red-700">
                  {invoice.error instanceof Error ? invoice.error.message : 'Invoice failed'}
                </p>
              ) : null}
              {d.billing.invoices.length > 0 ? (
                <div className="overflow-hidden rounded-md bg-surface-container-low">
                  {d.billing.invoices.map((inv) => (
                    <ListRow
                      key={inv.id}
                      title={inv.invoiceNumber}
                      subtitle={`${inv.kind} · ${formatIndianMoney(inv.totalPaise, false)}`}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-body-small text-grey-500">No billing snapshot yet.</p>
          )}

          <h2 className="mt-8 text-label text-grey-700">Suspension</h2>
          <p className="mt-1 text-body-small text-grey-600">
            Blocks staff and admin logins. Parent access is not blocked — they paid for the session.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {d.tenant.status === 'suspended' ? (
              <Button
                size="compact"
                onClick={() => unsuspend.mutate('Restored from platform console after dispute review.')}
              >
                Restore access
              </Button>
            ) : (
              <Button
                size="compact"
                variant="danger"
                onClick={() => {
                  const reason = window.prompt(
                    'Written reason for suspension (min 20 characters). Parents stay connected.',
                  );
                  if (reason && reason.trim().length >= 20) suspend.mutate(reason.trim());
                }}
              >
                Suspend school
              </Button>
            )}
          </div>

          <h2 className="mt-8 text-label text-grey-700">Support access</h2>
          <div className="mt-2 overflow-hidden rounded-md bg-surface-container-low">
            {d.supportSessions.length === 0 && (
              <p className="p-4 text-body-small text-grey-500">
                Nobody from our team has opened a support session for this school.
              </p>
            )}
            {d.supportSessions.map((s) => (
              <ListRow
                key={s.id}
                title={s.reason}
                subtitle={`${new Date(s.startedAt).toLocaleString('en-IN')}${
                  s.endedAt ? ` — ended ${new Date(s.endedAt).toLocaleString('en-IN')}` : ' — open'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

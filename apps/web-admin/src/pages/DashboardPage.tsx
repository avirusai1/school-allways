import { useNavigate } from 'react-router-dom';
import {
  Card,
  EmptyState,
  ErrorState,
  SectionHeader,
  Skeleton,
  Sparkline,
  StatTile,
  formatIndianMoney,
  formatIndianNumber,
} from '@saw/ui';

import {
  attendanceTone,
  usePrincipalDashboard,
  type ApprovalCounts,
  type PrincipalDashboard,
} from '../features/dashboard/useDashboard';
import { useAuth } from '../lib/auth';

const APPROVAL_LABELS: Array<{ key: keyof ApprovalCounts; label: string }> = [
  { key: 'staffLeave', label: 'Staff leave' },
  { key: 'studentLeave', label: 'Student leave' },
  { key: 'feeConcession', label: 'Fee concessions' },
  { key: 'circular', label: 'Circulars' },
];

export function DashboardPage() {
  const { session } = useAuth();
  const branchId = session?.branch?.id;
  const query = usePrincipalDashboard(branchId);
  const navigate = useNavigate();

  if (!branchId) {
    return (
      <EmptyState
        headline="No branch selected"
        body="Choose a branch in your session to see today's figures."
      />
    );
  }

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton height={48} className="w-64" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton height={96} />
          <Skeleton height={96} />
          <Skeleton height={96} />
          <Skeleton height={96} />
        </div>
        <Skeleton height={140} className="w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <ErrorState
        message="Today's figures could not be loaded."
        onRetry={() => void query.refetch()}
      />
    );
  }

  const d = query.data;

  if (!d.academicSessionId) {
    return (
      <EmptyState
        headline="No academic session yet"
        body="Attendance, fees and approvals are all recorded against a session. Create this year's session and the dashboard fills itself in."
        actionLabel="Set up the session"
        onAction={() => navigate('/setup/sessions')}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* The school and branch are already named in the top bar; repeating them
          here would cost a heading and say nothing. Every figure below is
          about today, so that is what the page is called. */}
      <h1 className="text-h1 text-grey-900">Today, {formatDayLong(d.day)}</h1>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AttendanceTile data={d} />
        <StaffTile data={d} />
        <StatTile
          label="Collected today"
          value={formatIndianMoney(d.collections.todayPaise, false)}
        />
        <StatTile
          label="Open items"
          value={formatIndianNumber(d.openItems.total)}
          tone={d.openItems.total > 0 ? 'warning' : 'neutral'}
          onClick={
            d.openItems.total > 0 ? () => navigate('/approvals') : undefined
          }
          caption={
            d.openItems.total > 0
              ? `${d.openItems.total - d.openItems.incidents} to approve · ${d.openItems.incidents} incident${d.openItems.incidents === 1 ? '' : 's'}`
              : 'Nothing waiting on you'
          }
        />
      </div>

      {d.unmarkedSections.length > 0 ? (
        <UnmarkedBanner
          sections={d.unmarkedSections}
          pending={d.attendance.totalSections - d.attendance.markedSections}
          onOpen={() => navigate('/attendance')}
        />
      ) : null}

      <section>
        <SectionHeader
          title="Approvals pending"
          action={
            d.openItems.total - d.openItems.incidents > 0 ? (
              <button
                type="button"
                onClick={() => navigate('/approvals')}
                className="text-body-small text-blue-500 hover:underline"
              >
                Open inbox
              </button>
            ) : undefined
          }
        />
        <Card padding={false}>
          {d.openItems.total - d.openItems.incidents === 0 ? (
            <p className="px-4 py-6 text-body-small text-grey-600">
              Nothing is waiting for a decision.
            </p>
          ) : (
            <ul>
              {APPROVAL_LABELS.filter(({ key }) => d.openItems.approvals[key] > 0).map(
                ({ key, label }) => (
                  <li key={key} className="border-b border-grey-100 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => navigate('/approvals')}
                      className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors duration-fast hover:bg-grey-25"
                    >
                      <span className="text-body text-grey-900">{label}</span>
                      <span className="text-numeric tabular-nums text-grey-900">
                        {d.openItems.approvals[key]}
                      </span>
                    </button>
                  </li>
                ),
              )}
            </ul>
          )}
        </Card>
      </section>

      {d.incidents.length > 0 ? (
        <section>
          <SectionHeader title="Recent incidents" />
          <Card padding={false}>
            <ul>
              {d.incidents.map((i) => (
                <li
                  key={i.id}
                  className="flex items-center justify-between gap-4 border-b border-grey-100 px-4 py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-body text-grey-900">{i.title}</p>
                    <p className="text-body-small text-grey-600">
                      {i.category} · {i.severity}
                    </p>
                  </div>
                  {i.occurredAt ? (
                    <span className="shrink-0 text-body-small tabular-nums text-grey-500">
                      {formatDayLong(i.occurredAt.slice(0, 10))}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      <section>
        <SectionHeader title="Collections" />
        <Card>
          {/* The figure lives in the tile above; this card is the shape of the
              fortnight behind it. */}
          <p className="text-caption text-grey-500">
            Last {d.collections.series.length} days, high{' '}
            {formatIndianMoney(
              Math.max(...d.collections.series.map((p) => p.amountPaise)),
              false,
            )}
          </p>
          <div className="mt-3">
            <Sparkline
              values={d.collections.series.map((p) => p.amountPaise)}
              label={`Daily fee collection for the last ${d.collections.series.length} days`}
              height={56}
            />
          </div>
          <div className="mt-2 flex justify-between text-caption text-grey-500">
            <span>{formatDayLong(d.collections.series[0]!.day)}</span>
            <span>Today</span>
          </div>
        </Card>
      </section>
    </div>
  );
}

function AttendanceTile({ data }: { data: PrincipalDashboard }) {
  const { attendance } = data;

  // Nothing marked is not zero attendance — saying "0.0%" before the first
  // register lands would have a principal chasing a crisis that isn't there.
  if (attendance.total === 0) {
    return (
      <StatTile
        label="Attendance today"
        value="—"
        caption={
          attendance.totalSections === 0
            ? 'No classes set up'
            : 'No registers marked yet'
        }
      />
    );
  }

  const partial = attendance.markedSections < attendance.totalSections;

  return (
    <StatTile
      label="Attendance today"
      value={`${(attendance.percentageBp / 100).toFixed(1)}%`}
      tone={attendanceTone(attendance.percentageBp)}
      caption={
        // Naming the denominator matters while sections are still coming in:
        // 90% of the four classes that have marked is not 90% of the school.
        partial
          ? `${formatIndianNumber(attendance.present)} of ${formatIndianNumber(attendance.total)} marked so far`
          : `${formatIndianNumber(attendance.present)} of ${formatIndianNumber(attendance.total)}`
      }
    />
  );
}

function StaffTile({ data }: { data: PrincipalDashboard }) {
  const { staff } = data;

  if (staff.marked === 0) {
    return (
      <StatTile
        label="Staff present"
        value="—"
        caption={
          staff.total === 0 ? 'No staff on file' : 'Staff attendance not taken'
        }
      />
    );
  }

  return (
    <StatTile
      label="Staff present"
      value={`${staff.present}/${staff.total}`}
      caption={
        staff.marked < staff.total ? `${staff.marked} marked so far` : undefined
      }
    />
  );
}

function UnmarkedBanner({
  sections,
  pending,
  onOpen,
}: {
  sections: PrincipalDashboard['unmarkedSections'];
  pending: number;
  onOpen: () => void;
}) {
  return (
    <div className="rounded-md border-l-[3px] border-red-500 bg-red-50 px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <p className="text-body-medium text-red-700">
          {pending === 1
            ? '1 section has not marked attendance'
            : `${pending} sections have not marked attendance`}
        </p>
        <button
          type="button"
          onClick={onOpen}
          className="shrink-0 text-body-small text-red-700 underline hover:no-underline"
        >
          Open attendance
        </button>
      </div>
      <p className="mt-1 text-body-small text-red-700">
        {sections.map((s) => s.sectionLabel).join(', ')}
        {pending > sections.length ? ` and ${pending - sections.length} more` : ''}
      </p>
    </div>
  );
}

/** `11 August` — the overline already says which day it is. */
function formatDayLong(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
  });
}

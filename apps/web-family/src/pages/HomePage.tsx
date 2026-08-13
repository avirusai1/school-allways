import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ErrorState,
  EmptyState,
  ListRow,
  Skeleton,
  StatTile,
  formatIndianMoney,
  formatSawDate,
} from '@saw/ui';
import { ChildSwitcher } from '../components/ChildSwitcher';
import { PaywallScreen } from '../components/PaywallScreen';
import { apiFetch } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useSelectedChild } from '../lib/use-selected-child';

/** Matches FamilyService.home() — build/13 §5 single-child feed. */
type HomeDto = {
  student: {
    id: string;
    firstName: string;
    lastName: string | null;
    fullName: string;
    photoPath: string | null;
    sectionId: string | null;
    rollNo: string | null;
  };
  today: {
    label: string;
    day: string;
    attendance: { status: string | null; label: string; inTime: string | null };
    homeworkDueCount: number;
    homeworkDueTodayCount: number;
    feesDuePaise: number;
  };
  bus: {
    routeName: string;
    stopsAway: number;
    eta: string;
    stopName: string | null;
    live: boolean;
  } | null;
  needsAttention: Array<{
    severity: 'red' | 'orange' | 'blue';
    title: string;
    route: string;
  }>;
  homeworkDue: Array<{
    id: string;
    title: string;
    dueOn: string | null;
    subjectId: string | null;
    submissionStatus: string | null;
    seenAt: string | null;
    dueToday: boolean;
  }>;
  notices: Array<{
    id: string;
    title: string;
    preview: string;
    type: string;
    publishedAt: string | null;
    requiresAcknowledgement: boolean;
    unread: boolean;
  }>;
  latestPhotos: Array<{ id: string; thumbUrl: string }>;
  locked?: boolean;
  subscription?: { status: string; expiresAt: string | null; graceEndsAt: string | null };
};

const ATTENTION_BORDER: Record<'red' | 'orange' | 'blue', string> = {
  red: 'border-l-red-500',
  orange: 'border-l-amber-500',
  blue: 'border-l-blue-500',
};

function webRoute(apiRoute: string): string {
  if (apiRoute.startsWith('/fees')) return '/fees';
  if (apiRoute.startsWith('/homework')) return '/diary';
  if (apiRoute.startsWith('/notices')) return '/';
  return apiRoute.startsWith('/') ? apiRoute : `/${apiRoute}`;
}

function attendanceTone(
  status: string | null,
): 'positive' | 'critical' | 'warning' | 'neutral' {
  switch (status) {
    case 'present':
    case 'late':
      return 'positive';
    case 'absent':
      return 'critical';
    case 'half_day':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function HomePage() {
  const { session } = useAuth();
  const {
    children,
    childrenQuery,
    studentId,
    setSelectedChildId,
  } = useSelectedChild();

  const home = useQuery({
    queryKey: ['family', 'home', studentId],
    queryFn: () =>
      apiFetch<HomeDto>(`/family/home?studentId=${encodeURIComponent(studentId!)}`),
    enabled: !!studentId,
  });

  const childrenPending = childrenQuery.isPending;
  const noChildren = childrenQuery.isSuccess && children.length === 0;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-h1 text-grey-900">
            Hello, {session?.user.fullName ?? 'Parent'}
          </h1>
          <p className="mt-1 text-body-small text-grey-600">{session?.tenant.name}</p>
        </div>
        {!noChildren && (
          <ChildSwitcher
            children={children}
            selectedId={studentId}
            onSelect={setSelectedChildId}
          />
        )}
      </div>

      {childrenPending && <Skeleton height={200} className="mt-6 w-full" />}

      {childrenQuery.isError && (
        <div className="mt-6">
          <ErrorState
            message={
              childrenQuery.error instanceof Error
                ? childrenQuery.error.message
                : 'Could not load children'
            }
            onRetry={() => void childrenQuery.refetch()}
          />
        </div>
      )}

      {noChildren && (
        <div className="mt-6">
          <EmptyState
            headline="No linked children"
            body="Ask your school for a join link to connect your child's profile."
          />
        </div>
      )}

      {studentId && home.isPending && (
        <div className="mt-6 space-y-3">
          <Skeleton height={112} className="w-full" />
          <Skeleton height={72} className="w-full" />
          <Skeleton height={120} className="w-full" />
        </div>
      )}

      {studentId && home.isError && (
        <div className="mt-6">
          <ErrorState
            message={home.error instanceof Error ? home.error.message : 'Could not load home'}
            onRetry={() => void home.refetch()}
          />
        </div>
      )}

      {home.isSuccess && home.data && (
        <div className="mt-6 space-y-3">
          {/* 1. Today strip — attendance always visible, even when locked */}
          <section className="overflow-hidden rounded-md border border-grey-200 bg-grey-0 p-4">
            <p className="text-overline text-grey-500">TODAY, {home.data.today.label}</p>
            <div className="mt-3 grid grid-cols-3 divide-x divide-grey-200">
              <StatTile
                className="rounded-none border-0 bg-transparent p-2 shadow-none"
                value={home.data.today.attendance.label}
                label="Attendance"
                tone={attendanceTone(home.data.today.attendance.status)}
              />
              {home.data.locked ? (
                <>
                  <StatTile
                    className="rounded-none border-0 bg-transparent p-2 shadow-none"
                    value="—"
                    label="Homework"
                  />
                  <StatTile
                    className="rounded-none border-0 bg-transparent p-2 shadow-none"
                    value="—"
                    label="Fees due"
                  />
                </>
              ) : (
                <>
                  <StatTile
                    className="rounded-none border-0 bg-transparent p-2 shadow-none"
                    value={String(home.data.today.homeworkDueCount)}
                    label="Homework"
                    caption={
                      home.data.today.homeworkDueTodayCount > 0
                        ? `${home.data.today.homeworkDueTodayCount} due today`
                        : undefined
                    }
                  />
                  <StatTile
                    className="rounded-none border-0 bg-transparent p-2 shadow-none"
                    value={formatIndianMoney(home.data.today.feesDuePaise, false)}
                    label="Fees due"
                    tone={home.data.today.feesDuePaise > 0 ? 'critical' : 'neutral'}
                  />
                </>
              )}
            </div>
          </section>

          {home.data.locked ? (
            <PaywallScreen children={children} highlightId={studentId} />
          ) : (
            <>

          {/* 2. Bus — only while present */}
          {home.data.bus?.live ? (
            <section className="rounded-md border border-cyan-200 bg-cyan-50 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-grey-900">
                    {home.data.bus.routeName}
                    {home.data.bus.stopsAway > 0
                      ? ` · ${home.data.bus.stopsAway} stops away`
                      : ''}
                  </p>
                  <p className="mt-0.5 text-caption text-grey-600">
                    ETA {home.data.bus.eta}
                    {home.data.bus.stopName ? ` · ${home.data.bus.stopName}` : ''}
                  </p>
                </div>
                <Link
                  to="/bus"
                  className="shrink-0 text-[13px] font-medium text-blue-700 hover:underline"
                >
                  Track
                </Link>
              </div>
            </section>
          ) : null}

          {/* 3. Needs attention */}
          {home.data.needsAttention.length > 0 ? (
            <section className="overflow-hidden rounded-md border border-grey-200 bg-grey-0">
              <h2 className="border-b border-grey-100 px-4 py-2 text-label text-grey-700">
                Needs attention
              </h2>
              <ul>
                {home.data.needsAttention.map((item, i) => (
                  <li key={`${item.route}-${i}`}>
                    <Link
                      to={webRoute(item.route)}
                      className={[
                        'block border-l-[3px] px-4 py-3 text-[13px] text-grey-900 hover:bg-grey-25',
                        ATTENTION_BORDER[item.severity],
                      ].join(' ')}
                    >
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* 4. Homework due */}
          <section>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 className="text-label text-grey-700">Homework due</h2>
              <Link to="/diary" className="text-[12px] font-medium text-blue-700 hover:underline">
                View all
              </Link>
            </div>
            {home.data.homeworkDue.length === 0 ? (
              <p className="rounded-md border border-grey-200 bg-grey-0 px-4 py-3 text-body-small text-grey-500">
                Nothing due right now.
              </p>
            ) : (
              <div className="overflow-hidden rounded-md border border-grey-200 bg-grey-0">
                {home.data.homeworkDue.map((h) => (
                  <ListRow
                    key={h.id}
                    title={h.title}
                    subtitle={
                      h.dueToday
                        ? 'Due today'
                        : h.dueOn
                          ? `Due ${formatSawDate(h.dueOn)}`
                          : undefined
                    }
                    trailing={
                      h.dueToday ? (
                        <span className="text-[12px] font-medium text-amber-700">Today</span>
                      ) : undefined
                    }
                  />
                ))}
              </div>
            )}
          </section>

          {/* 5. Recent notices */}
          <section>
            <h2 className="mb-2 text-label text-grey-700">Recent notices</h2>
            {home.data.notices.length === 0 ? (
              <p className="rounded-md border border-grey-200 bg-grey-0 px-4 py-3 text-body-small text-grey-500">
                No notices right now.
              </p>
            ) : (
              <div className="overflow-hidden rounded-md border border-grey-200 bg-grey-0">
                {home.data.notices.slice(0, 3).map((n) => (
                  <ListRow
                    key={n.id}
                    title={n.title}
                    subtitle={
                      n.publishedAt
                        ? formatSawDate(n.publishedAt)
                        : n.preview || undefined
                    }
                  />
                ))}
              </div>
            )}
          </section>

          {/* 6. Latest photos — only when present */}
          {home.data.latestPhotos.length > 0 ? (
            <section>
              <h2 className="mb-2 text-label text-grey-700">Latest photos</h2>
              <div className="flex gap-2 overflow-x-auto">
                {home.data.latestPhotos.map((p) => (
                  <img
                    key={p.id}
                    src={p.thumbUrl}
                    alt=""
                    className="h-24 w-24 shrink-0 rounded-sm object-cover"
                  />
                ))}
              </div>
            </section>
          ) : null}
            </>
          )}
          </div>
      )}
    </div>
  );
}

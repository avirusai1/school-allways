import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Chip, ErrorState, ListRow, Skeleton, type ChipTone } from '@saw/ui';
import { apiFetch } from '../lib/api';
import { PaywallScreen } from '../components/PaywallScreen';
import { isSubscriptionRequired } from '../lib/paywall';
import { useSelectedChild } from '../lib/use-selected-child';

/**
 * Parent diary screen. build/13 specifies separate /homework and /diary routes
 * with different UX; web-family only ships /diary in the nav today, and the
 * free-tier wedge story needs both visible here. Two sections on one page —
 * homework first (actionable), diary below (read-only notes) — until a full
 * /homework route with Pending|Completed|All lands.
 *
 * Multi-child: both endpoints omit studentId and resolve every linked child
 * from the self-scoped grant (same pattern as homework feed). Per-child pages
 * (Home, Fees, Results, Leave, Books) use the shared ChildSwitcher instead.
 */

type HomeworkRow = {
  id: string;
  studentId: string;
  studentName?: string;
  title: string;
  description?: string | null;
  assignedOn: string;
  dueOn?: string | null;
  subjectName?: string | null;
  submissionStatus?: string | null;
  seenAt?: string | null;
  submittedAt?: string | null;
  marksObtained?: number | null;
};

type DiaryRow = {
  id: string;
  day: string;
  entryType: string;
  body: string;
  studentId?: string | null;
  studentName?: string | null;
  authorName?: string | null;
};

const ENTRY_TONE: Record<string, ChipTone> = {
  note: 'neutral',
  appreciation: 'success',
  concern: 'danger',
  reminder: 'warning',
  observation: 'info',
};

function formatDay(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function homeworkSubtitle(row: HomeworkRow): string {
  const bits: string[] = [];
  if (row.subjectName) bits.push(row.subjectName);
  if (row.dueOn) bits.push(`Due ${formatDay(row.dueOn)}`);
  else bits.push(`Assigned ${formatDay(row.assignedOn)}`);
  if (row.studentName) bits.push(row.studentName);
  if (row.submissionStatus === 'graded' && row.marksObtained != null) {
    bits.push(`Marked ${row.marksObtained}`);
  } else if (row.submittedAt) {
    bits.push('Submitted');
  } else if (row.seenAt) {
    bits.push('Seen');
  } else {
    bits.push('Not opened');
  }
  return bits.join(' · ');
}

function diarySubtitle(row: DiaryRow): string {
  const bits: string[] = [formatDay(row.day)];
  if (row.studentName) bits.push(row.studentName);
  else bits.push('Whole class');
  if (row.authorName) bits.push(row.authorName);
  return bits.join(' · ');
}

export function DiaryPage() {
  const { children } = useSelectedChild();
  const allLocked =
    children.length > 0 && children.every((c) => c.subscribed === false && c.status !== 'grace');

  const homework = useQuery({
    queryKey: ['family', 'homework', 'feed'],
    queryFn: () => apiFetch<{ data?: HomeworkRow[] }>('/homework/feed'),
  });
  const diary = useQuery({
    queryKey: ['family', 'diary'],
    queryFn: () => apiFetch<{ data?: DiaryRow[] }>('/diary'),
  });

  const homeworkRows = homework.data?.data ?? [];
  const diaryRows = diary.data?.data ?? [];

  const diaryByDay = useMemo(() => {
    const groups = new Map<string, DiaryRow[]>();
    for (const row of diaryRows) {
      const key = row.day.slice(0, 10);
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }
    return [...groups.entries()];
  }, [diaryRows]);

  const pending = homework.isPending || diary.isPending;
  const errored = homework.isError || diary.isError;
  const ready = homework.isSuccess && diary.isSuccess;
  const empty = ready && homeworkRows.length === 0 && diaryRows.length === 0;

  const errorMessage =
    (homework.error instanceof Error && homework.error.message) ||
    (diary.error instanceof Error && diary.error.message) ||
    'Could not load diary';

  return (
    <div>
      <h1 className="text-h1 text-grey-900">Diary</h1>
      <p className="mt-1 text-body-small text-grey-600">
        Homework and class notes for your children. Read-only — teachers post here.
      </p>

      <div className="mt-6">
        {pending && <Skeleton height={180} className="w-full" />}
        {errored && (
          isSubscriptionRequired(homework.error) || isSubscriptionRequired(diary.error) ? (
            <PaywallScreen children={children} />
          ) : (
            <ErrorState
              message={errorMessage}
              onRetry={() => {
                void homework.refetch();
                void diary.refetch();
              }}
            />
          )
        )}
        {allLocked && !errored && !pending ? <PaywallScreen children={children} /> : null}
        {empty && !allLocked && (
          <p className="text-body-small text-grey-500">
            Nothing yet. Homework and diary notes from teachers will appear here.
          </p>
        )}

        {ready && homeworkRows.length > 0 && (
          <section className={diaryRows.length > 0 ? 'mb-8' : undefined}>
            <h2 className="text-label text-grey-700">Homework</h2>
            <div className="mt-2 overflow-hidden rounded-md bg-surface-container-low">
              {homeworkRows.map((row) => {
                const overdue =
                  row.dueOn &&
                  !row.submittedAt &&
                  row.dueOn.slice(0, 10) < new Date().toISOString().slice(0, 10);
                return (
                  <div
                    key={`${row.id}:${row.studentId}`}
                    className={overdue ? 'border-l-[3px] border-l-orange-500' : undefined}
                  >
                    <ListRow
                      title={row.title}
                      subtitle={homeworkSubtitle(row)}
                      trailing={
                        row.subjectName ? (
                          <Chip label={row.subjectName} tone="info" />
                        ) : undefined
                      }
                    />
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {ready && diaryRows.length > 0 && (
          <section>
            <h2 className="text-label text-grey-700">Class diary</h2>
            <div className="mt-2 space-y-4">
              {diaryByDay.map(([day, rows]) => (
                <div key={day}>
                  <div className="mb-1 text-overline uppercase tracking-wide text-grey-500">
                    {formatDay(day)}
                  </div>
                  <div className="overflow-hidden rounded-md bg-surface-container-low">
                    {rows.map((row) => (
                      <ListRow
                        key={row.id}
                        title={row.body}
                        subtitle={diarySubtitle(row)}
                        trailing={
                          <Chip
                            label={row.entryType}
                            tone={ENTRY_TONE[row.entryType] ?? 'neutral'}
                          />
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

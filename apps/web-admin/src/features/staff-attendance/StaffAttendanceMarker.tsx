import { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, ErrorState, SkeletonList } from '@saw/ui';

import {
  todayIso,
  useMarkStaffAttendance,
  useStaffRoster,
  type MarkStaffResult,
  type StaffRosterRow,
  type StaffStatus,
} from './useStaffAttendance';

type Props = {
  branchId: string;
  day?: string;
  onMarked?: (result: MarkStaffResult) => void;
};

const CHOICES: Array<{ value: StaffStatus; letter: string; label: string }> = [
  { value: 'present', letter: 'P', label: 'Present' },
  { value: 'absent', letter: 'A', label: 'Absent' },
  { value: 'late', letter: 'L', label: 'Late' },
  { value: 'on_leave', letter: 'V', label: 'On leave' },
];

const CHOICE_CLASS: Record<StaffStatus, string> = {
  present: 'border-green-500 bg-green-50 text-green-700',
  absent: 'border-red-500 bg-red-50 text-red-700',
  late: 'border-orange-500 bg-orange-50 text-orange-700',
  on_leave: 'border-blue-500 bg-blue-50 text-blue-700',
  half_day: 'border-blue-500 bg-blue-50 text-blue-700',
  excused: 'border-grey-400 bg-grey-50 text-grey-700',
};

/**
 * The staff register. Everyone starts present because that is how it is
 * actually marked — the clerk taps only the people who are not in.
 */
export function StaffAttendanceMarker({
  branchId,
  day = todayIso(),
  onMarked,
}: Props) {
  const rosterQ = useStaffRoster(branchId, day);
  const mark = useMarkStaffAttendance();
  const [marks, setMarks] = useState<Record<string, StaffStatus>>({});
  const [error, setError] = useState<string | null>(null);

  const roster = rosterQ.data;

  useEffect(() => {
    if (!roster) return;
    const next: Record<string, StaffStatus> = {};
    for (const r of roster.rows) {
      if (isMarkable(r.status)) next[r.staffId] = r.status;
      // Approved leave pre-selects itself so nobody has to remember who is away.
      else if (r.onApprovedLeave) next[r.staffId] = 'on_leave';
      else next[r.staffId] = 'present';
    }
    setMarks(next);
  }, [roster]);

  const counts = useMemo(() => {
    const values = Object.values(marks);
    return {
      present: values.filter((v) => v === 'present').length,
      absent: values.filter((v) => v === 'absent').length,
      late: values.filter((v) => v === 'late').length,
      onLeave: values.filter((v) => v === 'on_leave').length,
    };
  }, [marks]);

  const groups = useMemo(() => groupByDepartment(roster?.rows ?? []), [roster]);

  if (rosterQ.isPending) return <SkeletonList count={6} />;

  if (rosterQ.isError) {
    return (
      <ErrorState
        message={
          rosterQ.error instanceof Error
            ? rosterQ.error.message
            : 'Could not load the staff list. Try again in a moment.'
        }
        onRetry={() => void rosterQ.refetch()}
      />
    );
  }

  if (!roster || roster.rows.length === 0) {
    return (
      <EmptyState
        headline="No staff on file yet"
        body="Add or import your staff, then come back to mark the register."
      />
    );
  }

  async function submit() {
    setError(null);
    try {
      const result = await mark.mutateAsync({
        branchId,
        day,
        entries: roster!.rows.map((r) => ({
          staffId: r.staffId,
          status: marks[r.staffId] ?? 'present',
        })),
      });
      onMarked?.(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the register.');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-body font-semibold text-grey-900">
            {roster.meta.total} staff
          </p>
          <p className="mt-0.5 text-body-small text-grey-600">
            {counts.present} present · {counts.absent} absent · {counts.late} late
            {counts.onLeave > 0 ? ` · ${counts.onLeave} on leave` : ''}
          </p>
        </div>
        <Button
          variant="ghost"
          size="compact"
          onClick={() =>
            setMarks(
              Object.fromEntries(
                roster.rows.map((r) => [r.staffId, 'present' as StaffStatus]),
              ),
            )
          }
        >
          Mark all present
        </Button>
      </div>

      {roster.meta.marked > 0 ? (
        <p className="text-body-small text-grey-600">
          Already marked for this day. Saving again amends the register.
        </p>
      ) : null}

      {error ? <ErrorState message={error} onRetry={() => setError(null)} /> : null}

      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <div key={group.name}>
            {groups.length > 1 ? (
              <p className="mb-1.5 text-overline uppercase text-grey-700">
                {group.name}
              </p>
            ) : null}
            <ul className="divide-y divide-grey-200 rounded-md border border-grey-200 bg-grey-0">
              {group.rows.map((r) => (
                <li
                  key={r.staffId}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
                >
                  <span className="text-body text-grey-900">
                    <span className="mr-2 text-body-small text-grey-500">
                      {r.employeeCode}
                    </span>
                    {r.fullName}
                    {r.designation ? (
                      <span className="ml-2 text-body-small text-grey-600">
                        {r.designation}
                      </span>
                    ) : null}
                    {r.onApprovedLeave ? (
                      <span className="ml-2 text-body-small text-blue-700">
                        (approved leave)
                      </span>
                    ) : null}
                  </span>
                  <span
                    className="flex gap-1.5"
                    role="group"
                    aria-label={`Attendance for ${r.fullName}`}
                  >
                    {CHOICES.map((c) => {
                      const selected = (marks[r.staffId] ?? 'present') === c.value;
                      return (
                        <button
                          key={c.value}
                          type="button"
                          aria-pressed={selected}
                          title={c.label}
                          className={[
                            'h-9 w-9 rounded-sm border text-body-small font-semibold',
                            selected
                              ? CHOICE_CLASS[c.value]
                              : 'border-grey-300 bg-grey-0 text-grey-600 hover:bg-grey-50',
                          ].join(' ')}
                          onClick={() =>
                            setMarks((prev) => ({ ...prev, [r.staffId]: c.value }))
                          }
                        >
                          {c.letter}
                        </button>
                      );
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" loading={mark.isPending} onClick={() => void submit()}>
          Save register
        </Button>
        <span className="text-body-small text-grey-600">
          Saved in one go — nobody is notified.
        </span>
      </div>
    </div>
  );
}

function isMarkable(status: string): status is StaffStatus {
  return status !== 'not_marked' && status !== 'holiday';
}

/** One list when nobody has a department set, which is the common small school. */
function groupByDepartment(
  rows: StaffRosterRow[],
): Array<{ name: string; rows: StaffRosterRow[] }> {
  if (rows.every((r) => !r.department)) {
    return [{ name: 'All staff', rows }];
  }

  const byName = new Map<string, StaffRosterRow[]>();
  for (const r of rows) {
    const key = r.department ?? 'Other';
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(r);
  }
  return [...byName].map(([name, group]) => ({ name, rows: group }));
}

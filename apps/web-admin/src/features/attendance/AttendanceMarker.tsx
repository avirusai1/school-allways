import { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, ErrorState, SkeletonList } from '@saw/ui';
import {
  todayIso,
  useMarkAttendance,
  useRoster,
  type MarkableStatus,
  type MarkResult,
} from './useAttendance';

type Props = {
  sectionId: string;
  day?: string;
  onMarked?: (result: MarkResult) => void;
};

const CHOICES: Array<{ value: MarkableStatus; letter: string; label: string }> = [
  { value: 'present', letter: 'P', label: 'Present' },
  { value: 'absent', letter: 'A', label: 'Absent' },
  { value: 'late', letter: 'L', label: 'Late' },
];

const CHOICE_CLASS: Record<MarkableStatus, string> = {
  present: 'border-green-500 bg-green-50 text-green-700',
  absent: 'border-red-500 bg-red-50 text-red-700',
  late: 'border-orange-500 bg-orange-50 text-orange-700',
  half_day: 'border-blue-500 bg-blue-50 text-blue-700',
  excused: 'border-grey-400 bg-grey-50 text-grey-700',
};

/**
 * The daily register. Everyone starts present because that is how Indian
 * schools actually mark — the clerk taps only the absentees.
 */
export function AttendanceMarker({ sectionId, day = todayIso(), onMarked }: Props) {
  const rosterQ = useRoster(sectionId, day);
  const mark = useMarkAttendance();
  const [marks, setMarks] = useState<Record<string, MarkableStatus>>({});
  const [error, setError] = useState<string | null>(null);

  const roster = rosterQ.data;

  useEffect(() => {
    if (!roster) return;
    const next: Record<string, MarkableStatus> = {};
    for (const s of roster.students) {
      if (s.onApprovedLeave) next[s.studentId] = 'excused';
      else if (s.status === 'absent' || s.status === 'late' || s.status === 'half_day') {
        next[s.studentId] = s.status;
      } else next[s.studentId] = 'present';
    }
    setMarks(next);
  }, [roster]);

  const counts = useMemo(() => {
    const values = Object.values(marks);
    return {
      present: values.filter((v) => v === 'present').length,
      absent: values.filter((v) => v === 'absent').length,
      late: values.filter((v) => v === 'late').length,
    };
  }, [marks]);

  if (rosterQ.isPending) return <SkeletonList count={6} />;

  if (rosterQ.isError) {
    return (
      <ErrorState
        message={
          rosterQ.error instanceof Error
            ? rosterQ.error.message
            : 'Could not load the class list. Try again in a moment.'
        }
        onRetry={() => void rosterQ.refetch()}
      />
    );
  }

  if (!roster || roster.students.length === 0) {
    return (
      <EmptyState
        headline="No students in this class yet"
        body="Import or add students to this section, then come back to mark attendance."
      />
    );
  }

  const locked = roster.register.isLocked;

  async function submit() {
    setError(null);
    try {
      const result = await mark.mutateAsync({
        sectionId,
        academicSessionId: roster!.register.academicSessionId,
        day,
        entries: roster!.students.map((s) => ({
          studentId: s.studentId,
          status: marks[s.studentId] ?? 'present',
        })),
      });
      onMarked?.(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save attendance.');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-body font-semibold text-grey-900">
            {roster.register.sectionLabel} · {roster.meta.total} students
          </p>
          <p className="mt-0.5 text-body-small text-grey-600">
            {counts.present} present · {counts.absent} absent · {counts.late} late
          </p>
        </div>
        <Button
          variant="ghost"
          size="compact"
          onClick={() =>
            setMarks(
              Object.fromEntries(
                roster.students.map((s) => [s.studentId, 'present' as MarkableStatus]),
              ),
            )
          }
        >
          Mark all present
        </Button>
      </div>

      {roster.meta.isHoliday ? (
        <p className="rounded-md border border-orange-500 bg-orange-50 px-3 py-2 text-body-small text-orange-700">
          {roster.meta.holidayTitle ?? 'This day is a holiday'} — marking is still
          allowed, but check the calendar first.
        </p>
      ) : null}

      {roster.register.markedAt ? (
        <p className="text-body-small text-grey-600">
          Already marked{roster.register.markedByName ? ` by ${roster.register.markedByName}` : ''}.
          Saving again amends the register.
        </p>
      ) : null}

      {error ? <ErrorState message={error} onRetry={() => setError(null)} /> : null}

      <ul className="divide-y divide-grey-200 rounded-md border border-grey-200 bg-grey-0">
        {roster.students.map((s) => {
          const value = marks[s.studentId] ?? 'present';
          return (
            <li
              key={s.studentId}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
            >
              <span className="text-body text-grey-900">
                <span className="mr-2 text-body-small text-grey-500">
                  {s.rollNo ?? '—'}
                </span>
                {s.fullName}
                {s.onApprovedLeave ? (
                  <span className="ml-2 text-body-small text-grey-600">
                    (approved leave)
                  </span>
                ) : null}
              </span>
              <span className="flex gap-1.5" role="group" aria-label={`Attendance for ${s.fullName}`}>
                {CHOICES.map((c) => {
                  const selected = value === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      disabled={locked}
                      aria-pressed={selected}
                      title={c.label}
                      className={[
                        'h-9 w-9 rounded-sm border text-body-small font-semibold disabled:opacity-50',
                        selected
                          ? CHOICE_CLASS[c.value]
                          : 'border-grey-300 bg-grey-0 text-grey-600 hover:bg-grey-50',
                      ].join(' ')}
                      onClick={() =>
                        setMarks((prev) => ({ ...prev, [s.studentId]: c.value }))
                      }
                    >
                      {c.letter}
                    </button>
                  );
                })}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          loading={mark.isPending}
          disabled={locked}
          onClick={() => void submit()}
        >
          Save attendance
        </Button>
        {locked ? (
          <span className="text-body-small text-grey-600">
            This register is locked. Ask an admin to amend it.
          </span>
        ) : (
          <span className="text-body-small text-grey-600">
            Parents of absent students are notified automatically.
          </span>
        )}
      </div>
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { Card, EmptyState, ErrorState, SectionHeader, Skeleton } from '@saw/ui';
import { apiFetch } from '../lib/api';

/** Matches FamilyService.selfTimetable(). */
type Slot = {
  id: string;
  weekday: number;
  roomNo: string | null;
  subjectName: string | null;
  periodName: string;
  sequence: number;
  startTime: string;
  endTime: string;
  isBreak: boolean;
};

/** ISO weekday: 1 = Monday. Indian schools commonly run Monday–Saturday. */
const DAYS = [
  { n: 1, label: 'Monday' },
  { n: 2, label: 'Tuesday' },
  { n: 3, label: 'Wednesday' },
  { n: 4, label: 'Thursday' },
  { n: 5, label: 'Friday' },
  { n: 6, label: 'Saturday' },
  { n: 7, label: 'Sunday' },
];

/** "09:00:00" → "9:00 am" */
function clock(value: string): string {
  const [h, m] = value.split(':');
  const hour = Number(h);
  const suffix = hour < 12 ? 'am' : 'pm';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${m} ${suffix}`;
}

export function TimetablePage() {
  const q = useQuery({
    queryKey: ['family', 'timetable'],
    queryFn: () => apiFetch<{ data: Slot[]; sectionId: string | null }>('/family/timetable'),
  });

  if (q.isPending) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton height={40} className="w-48" />
        <Skeleton height={180} className="w-full" />
        <Skeleton height={180} className="w-full" />
      </div>
    );
  }

  if (q.isError) {
    return (
      <ErrorState
        message={q.error instanceof Error ? q.error.message : 'Could not load your timetable'}
        onRetry={() => void q.refetch()}
      />
    );
  }

  const slots = q.data?.data ?? [];
  const today = new Date().getDay() === 0 ? 7 : new Date().getDay();

  if (slots.length === 0) {
    return (
      <div>
        <h1 className="text-h1 text-grey-900">Timetable</h1>
        <div className="mt-6">
          <EmptyState
            headline="No timetable yet"
            body="Your school has not published a timetable for your class. It will appear here as soon as they do."
          />
        </div>
      </div>
    );
  }

  const byDay = DAYS.map((d) => ({
    ...d,
    slots: slots
      .filter((s) => s.weekday === d.n)
      .sort((a, b) => a.sequence - b.sequence),
  })).filter((d) => d.slots.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1 text-grey-900">Timetable</h1>

      {byDay.map((day) => (
        <section key={day.n}>
          <SectionHeader
            title={day.label}
            overline={day.n === today ? 'Today' : undefined}
          />
          <Card padding={false}>
            <table className="w-full text-left text-body-small">
              <tbody>
                {day.slots.map((slot) => (
                  <tr
                    key={slot.id}
                    className="border-b border-grey-100 last:border-b-0"
                  >
                    <td className="w-32 whitespace-nowrap px-4 py-3 align-top text-grey-500 tabular-nums">
                      {clock(slot.startTime)}
                      <div className="text-[11px] text-grey-400">
                        {clock(slot.endTime)}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div
                        className={
                          slot.isBreak
                            ? 'text-grey-500'
                            : 'font-medium text-grey-900'
                        }
                      >
                        {slot.isBreak
                          ? slot.periodName
                          : (slot.subjectName ?? slot.periodName)}
                      </div>
                      {slot.roomNo && !slot.isBreak ? (
                        <div className="text-[12px] text-grey-500">
                          Room {slot.roomNo}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      ))}
    </div>
  );
}

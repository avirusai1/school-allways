import { Chip, type ChipTone } from './Chip';

export type AttendanceStatus =
  | 'present'
  | 'absent'
  | 'late'
  | 'half_day'
  | 'leave'
  | 'holiday';

const META: Record<AttendanceStatus, { letter: string; tone: ChipTone }> = {
  present: { letter: 'P', tone: 'success' },
  absent: { letter: 'A', tone: 'danger' },
  late: { letter: 'L', tone: 'warning' },
  half_day: { letter: 'H', tone: 'info' },
  leave: { letter: 'E', tone: 'neutral' },
  holiday: { letter: '-', tone: 'neutral' },
};

/** Letter + colour — never colour alone (~8% colour-blind). */
export function AttendanceChip({ status }: { status: AttendanceStatus }) {
  const m = META[status];
  return <Chip label={m.letter} tone={m.tone} />;
}

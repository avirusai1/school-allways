/**
 * Static national holiday list for onboarding "Add national holidays".
 * Month/day only — expanded into the selected session date range.
 */
export const INDIAN_NATIONAL_HOLIDAYS: ReadonlyArray<{
  month: number;
  day: number;
  title: string;
}> = [
  { month: 1, day: 26, title: 'Republic Day' },
  { month: 8, day: 15, title: 'Independence Day' },
  { month: 10, day: 2, title: 'Gandhi Jayanti' },
  { month: 1, day: 1, title: 'New Year' },
  { month: 5, day: 1, title: 'Labour Day' },
  { month: 12, day: 25, title: 'Christmas' },
];

/** Inclusive date strings YYYY-MM-DD → holiday rows that fall inside the range. */
export function holidaysInRange(
  startDate: string,
  endDate: string,
): Array<{ day: string; title: string }> {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return [];
  }

  const out: Array<{ day: string; title: string }> = [];
  const startYear = start.getUTCFullYear();
  const endYear = end.getUTCFullYear();

  for (let year = startYear; year <= endYear; year += 1) {
    for (const h of INDIAN_NATIONAL_HOLIDAYS) {
      const day = `${year}-${String(h.month).padStart(2, '0')}-${String(h.day).padStart(2, '0')}`;
      const d = new Date(`${day}T00:00:00Z`);
      if (d >= start && d <= end) {
        out.push({ day, title: h.title });
      }
    }
  }
  return out;
}

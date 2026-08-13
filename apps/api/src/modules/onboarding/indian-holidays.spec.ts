import { describe, expect, it } from 'vitest';

import { holidaysInRange } from './indian-holidays';

describe('holidaysInRange', () => {
  it('includes Independence Day for a full academic year', () => {
    const days = holidaysInRange('2026-04-01', '2027-03-31');
    expect(days.some((d) => d.day === '2026-08-15')).toBe(true);
    expect(days.some((d) => d.title === 'Republic Day' && d.day === '2027-01-26')).toBe(
      true,
    );
  });

  it('returns empty for inverted range', () => {
    expect(holidaysInRange('2027-01-01', '2026-01-01')).toEqual([]);
  });
});

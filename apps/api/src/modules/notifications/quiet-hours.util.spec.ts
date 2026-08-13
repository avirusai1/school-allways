import { describe, expect, it } from 'vitest';

import {
  isInQuietHours,
  nextQuietHoursEnd,
  renderTemplate,
} from './quiet-hours.util';

describe('quiet hours', () => {
  it('defers overnight window 21:00–07:00', () => {
    expect(isInQuietHours(at('22:30'), '21:00', '07:00')).toBe(true);
    expect(isInQuietHours(at('06:59'), '21:00', '07:00')).toBe(true);
    expect(isInQuietHours(at('07:00'), '21:00', '07:00')).toBe(false);
    expect(isInQuietHours(at('12:00'), '21:00', '07:00')).toBe(false);
    expect(isInQuietHours(at('20:59'), '21:00', '07:00')).toBe(false);
  });

  it('handles same-day quiet windows', () => {
    expect(isInQuietHours(at('14:00'), '13:00', '15:00')).toBe(true);
    expect(isInQuietHours(at('15:00'), '13:00', '15:00')).toBe(false);
  });

  it('schedules deferral to quiet-hours end', () => {
    const now = at('22:00');
    const end = nextQuietHoursEnd(now, '07:00');
    expect(end.getHours()).toBe(7);
    expect(end.getMinutes()).toBe(0);
    expect(end.getTime()).toBeGreaterThan(now.getTime());
  });

  it('renders template variables', () => {
    expect(renderTemplate('{{studentName}} is absent on {{date}}', {
      studentName: 'Aarav',
      date: '10 Aug',
    })).toBe('Aarav is absent on 10 Aug');
  });
});

function at(hm: string): Date {
  const [h, m] = hm.split(':').map(Number);
  const d = new Date('2026-08-10T00:00:00');
  d.setHours(h!, m!, 0, 0);
  return d;
}

/**
 * Quiet-hours helpers. Defaults 21:00–07:00 IST; tenants may override via
 * tenant_settings. Critical priority always bypasses.
 */

export function parseHm(value: string): { h: number; m: number } {
  const [h, m] = value.split(':').map(Number);
  return { h: h ?? 21, m: m ?? 0 };
}

/** True when `now` falls inside the quiet window (handles overnight wrap). */
export function isInQuietHours(
  now: Date,
  start = '21:00',
  end = '07:00',
): boolean {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const s = parseHm(start);
  const e = parseHm(end);
  const startMin = s.h * 60 + s.m;
  const endMin = e.h * 60 + e.m;

  if (startMin === endMin) return false;
  if (startMin < endMin) {
    return minutes >= startMin && minutes < endMin;
  }
  // Overnight: 21:00 → 07:00
  return minutes >= startMin || minutes < endMin;
}

/** Next wall-clock moment when quiet hours end (for deferred scheduling). */
export function nextQuietHoursEnd(
  now: Date,
  end = '07:00',
): Date {
  const e = parseHm(end);
  const result = new Date(now);
  result.setSeconds(0, 0);
  result.setHours(e.h, e.m, 0, 0);
  if (result <= now) {
    result.setDate(result.getDate() + 1);
  }
  return result;
}

export function renderTemplate(
  body: string,
  variables: Record<string, string>,
): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? '');
}

/**
 * Shared formatters — identical semantics to Flutter design_system.
 * Keep this file free of React so Node can test it without a JSX loader.
 */

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** Integer paise → Indian-grouped rupees (`₹12,50,000.50`). */
export function formatIndianMoney(paise: number, showPaise = true): string {
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const fraction = abs % 100;
  const grouped = indianGroup(rupees);
  const sign = negative ? '-' : '';
  if (!showPaise && fraction === 0) return `${sign}₹${grouped}`;
  return `${sign}₹${grouped}.${String(fraction).padStart(2, '0')}`;
}

export function formatIndianNumber(value: number): string {
  const negative = value < 0;
  const grouped = indianGroup(Math.abs(value));
  return negative ? `-${grouped}` : grouped;
}

function indianGroup(n: number): string {
  const s = String(n);
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  let rest = s.slice(0, -3);
  const parts: string[] = [];
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) parts.unshift(rest);
  return `${parts.join(',')},${last3}`;
}

/** Canonical UI date: `10 Aug 2026` — never `10/08/2026`. */
export function formatSawDate(value: string | Date | number): string {
  const d =
    typeof value === 'string'
      ? parseIsoDate(value)
      : typeof value === 'number'
        ? new Date(value)
        : value;
  if (Number.isNaN(d.getTime())) return '';
  // Date-only ISO is UTC; local Date uses local getters.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function parseIsoDate(iso: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, day] = iso.split('-').map(Number);
    return new Date(Date.UTC(y!, m! - 1, day!));
  }
  return new Date(iso);
}

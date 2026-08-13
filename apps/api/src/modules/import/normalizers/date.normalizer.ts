/** Parse common Indian date formats and Excel serial numbers to ISO YYYY-MM-DD. */
export function parseIndianDate(value: string | number): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return excelSerialToIso(value);
  }

  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const serial = Number(trimmed);
  if (/^\d+(\.\d+)?$/.test(trimmed) && serial > 1000 && serial < 100_000) {
    return excelSerialToIso(serial);
  }

  const dmySlash = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(trimmed);
  if (dmySlash) return buildIsoDate(dmySlash[1], dmySlash[2], dmySlash[3]);

  const dmyDash = /^(\d{1,2})-(\d{1,2})-(\d{2,4})$/.exec(trimmed);
  if (dmyDash) return buildIsoDate(dmyDash[1], dmyDash[2], dmyDash[3]);

  const dmyDot = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/.exec(trimmed);
  if (dmyDot) return buildIsoDate(dmyDot[1], dmyDot[2], dmyDot[3]);

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return isValidIsoParts(trimmed.slice(0, 4), trimmed.slice(5, 7), trimmed.slice(8, 10))
      ? trimmed
      : null;
  }

  const dmyText = /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/.exec(trimmed);
  if (dmyText) {
    const month = monthNameToNumber(dmyText[2]);
    if (month) return buildIsoDate(dmyText[1], String(month), dmyText[3]);
  }

  const ymdSlash = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(trimmed);
  if (ymdSlash) return buildIsoDate(ymdSlash[3], ymdSlash[2], ymdSlash[1]);

  return null;
}

function excelSerialToIso(serial: number): string | null {
  const epoch = Date.UTC(1899, 11, 30);
  const d = new Date(epoch + serial * 86_400_000);
  const iso = d.toISOString().slice(0, 10);
  return isValidIsoParts(iso.slice(0, 4), iso.slice(5, 7), iso.slice(8, 10)) ? iso : null;
}

function buildIsoDate(dayStr: string, monthStr: string, yearStr: string): string | null {
  const day = Number(dayStr);
  const month = Number(monthStr);
  let year = Number(yearStr);
  if (year < 100) year += year >= 50 ? 1900 : 2000;
  if (!isValidIsoParts(String(year), String(month).padStart(2, '0'), String(day).padStart(2, '0'))) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isValidIsoParts(yearStr: string, monthStr: string, dayStr: string): boolean {
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function monthNameToNumber(name: string): number | null {
  return MONTHS[name.toLowerCase()] ?? null;
}

/** Human-readable date for validation error messages. */
export function formatDateForError(raw: string): string {
  return raw.trim() || '(blank)';
}

export function invalidDateMessage(raw: string): string {
  const dmy = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(raw.trim());
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += year >= 50 ? 1900 : 2000;
    const monthNames = [
      '', 'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    if (month >= 1 && month <= 12) {
      return `${day} ${monthNames[month]} ${year} is not a real date. Use DD/MM/YYYY.`;
    }
  }
  return `${formatDateForError(raw)} is not a valid date. Use DD/MM/YYYY.`;
}

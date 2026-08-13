/** Escape a cell for RFC4180-ish CSV output. */
export function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCsv(headers: string[], rows: string[][]): string {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) {
    lines.push(row.map((c) => csvCell(c)).join(','));
  }
  return `${lines.join('\n')}\n`;
}

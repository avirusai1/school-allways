import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import ExcelJS from 'exceljs';

import type { RawImportRow } from '../import.types';
import { suggestColumnMapping } from '../import.util';

export interface ParseResult {
  headers: string[];
  headerRowIndex: number;
  rows: RawImportRow[];
}

/** Stream-parse CSV without loading the whole file. */
export async function parseCsvFile(filePath: string): Promise<ParseResult> {
  const lines: string[][] = [];
  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    lines.push(parseCsvLine(line));
    if (lines.length > 10_000) break;
  }

  return buildParseResult(lines);
}

/** Stream-parse XLSX via exceljs WorkbookReader. */
export async function parseExcelFile(filePath: string): Promise<ParseResult> {
  const lines: string[][] = [];
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    sharedStrings: 'cache',
    hyperlinks: 'ignore',
    styles: 'ignore',
  });

  for await (const worksheet of reader) {
    for await (const row of worksheet) {
      const values = row.values as (string | number | null | undefined)[];
      const cells = values.slice(1).map((v) => cellToString(v));
      if (cells.every((c) => !c.trim())) continue;
      lines.push(cells);
      if (lines.length > 10_000) break;
    }
    break;
  }

  return buildParseResult(lines);
}

export async function parseImportFile(filePath: string): Promise<ParseResult> {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.csv')) return parseCsvFile(filePath);
  return parseExcelFile(filePath);
}

export async function detectColumnsFromFile(filePath: string): Promise<{
  headers: string[];
  headerRowIndex: number;
}> {
  const parsed = await parseImportFile(filePath);
  return { headers: parsed.headers, headerRowIndex: parsed.headerRowIndex };
}

function buildParseResult(lines: string[][]): ParseResult {
  const headerRowIndex = detectHeaderRowIndex(lines);
  const headers = (lines[headerRowIndex] ?? []).map((h) => h.trim()).filter(Boolean);
  const rows: RawImportRow[] = [];

  for (let i = headerRowIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.every((c) => !c?.trim())) continue;

    const values: Record<string, string> = {};
    headers.forEach((header, col) => {
      values[header] = (line[col] ?? '').trim();
    });

    if (Object.values(values).every((v) => !v)) continue;
    rows.push({ rowNumber: i + 1, values });
  }

  return { headers, headerRowIndex, rows };
}

/** Title rows above the real header — pick the row that fuzzy-maps best. */
export function detectHeaderRowIndex(lines: string[][]): number {
  let bestIdx = 0;
  let bestScore = -1;

  const scan = Math.min(lines.length, 8);
  for (let i = 0; i < scan; i++) {
    const headers = lines[i].map((c) => c.trim()).filter(Boolean);
    if (headers.length < 2) continue;
    const mapping = suggestColumnMapping(headers);
    const score = Object.keys(mapping).length;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return bestIdx;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function cellToString(v: string | number | Date | null | undefined): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

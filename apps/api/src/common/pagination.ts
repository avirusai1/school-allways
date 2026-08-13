export interface Page<T> {
  data: T[];
  meta: { nextCursor: string | null; hasMore: boolean; count: number };
}

export function encodeCursor(value: string, id: string): string {
  return Buffer.from(JSON.stringify({ v: value, i: id })).toString('base64url');
}

export function decodeCursor(
  cursor?: string,
): { value: string; id: string } | undefined {
  if (!cursor) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as {
      v?: unknown;
      i?: unknown;
    };
    if (typeof parsed?.v !== 'string' || typeof parsed?.i !== 'string') return undefined;
    return { value: parsed.v, id: parsed.i };
  } catch {
    return undefined;
  }
}

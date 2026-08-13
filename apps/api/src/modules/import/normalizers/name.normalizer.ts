const RELATION_PREFIXES = /\b(S\/O|D\/O|W\/O|C\/O|SON OF|DAUGHTER OF|WIFE OF)\b/gi;

export interface ParsedName {
  firstName: string;
  middleName?: string;
  lastName?: string;
}

/** Split Indian name formats: "SHARMA,AARAV" or "AARAV S/O RAJESH". */
export function parseName(raw: string): ParsedName | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.includes(',')) {
    const [last, first] = trimmed.split(',').map((p) => p.trim());
    if (!first) return null;
    return titleCaseParts({ firstName: first, lastName: last || undefined });
  }

  const withoutRelation = trimmed.replace(RELATION_PREFIXES, ' ').replace(/\s+/g, ' ').trim();
  const parts = withoutRelation.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return titleCaseParts({ firstName: parts[0] });

  return titleCaseParts({
    firstName: parts[0],
    middleName: parts.length > 2 ? parts.slice(1, -1).join(' ') : undefined,
    lastName: parts.length > 1 ? parts[parts.length - 1] : undefined,
  });
}

function titleCaseParts(name: ParsedName): ParsedName {
  const tc = (s: string) =>
    s
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

  return {
    firstName: tc(name.firstName),
    middleName: name.middleName ? tc(name.middleName) : undefined,
    lastName: name.lastName ? tc(name.lastName) : undefined,
  };
}

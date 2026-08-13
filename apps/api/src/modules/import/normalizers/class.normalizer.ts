const ROMAN: Record<string, number> = {
  I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10,
  XI: 11, XII: 12,
};

const WORDS: Record<string, number> = {
  nursery: -3, lkg: -2, ukg: -1,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  eleventh: 11, twelfth: 12,
};

/** Normalise class labels like V, 5, 5th, Class V, FIFTH to a numeric level. */
export function parseClassLevel(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const upper = trimmed.toUpperCase().replace(/^CLASS\s+/i, '').trim();
  const ordinal = /^(\d+)(ST|ND|RD|TH)?$/i.exec(upper);
  if (ordinal) {
    const n = Number(ordinal[1]);
    return n >= -3 && n <= 12 ? n : null;
  }

  if (ROMAN[upper] !== undefined) return ROMAN[upper];

  const word = WORDS[upper.toLowerCase()];
  if (word !== undefined) return word;

  const embeddedRoman = /\b([IVX]+)\b/.exec(upper);
  if (embeddedRoman && ROMAN[embeddedRoman[1]]) return ROMAN[embeddedRoman[1]];

  const embeddedDigit = /\b(\d{1,2})\b/.exec(upper);
  if (embeddedDigit) {
    const n = Number(embeddedDigit[1]);
    return n >= -3 && n <= 12 ? n : null;
  }

  return null;
}

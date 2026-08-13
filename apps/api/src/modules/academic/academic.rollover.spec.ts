import { describe, expect, it } from 'vitest';

/**
 * Pure plan coverage — DB commit is exercised via integration when seeded.
 * Promotion ladder: UKG → I, X → XI, XII → graduate.
 */

function nextLevel(level: number): number | null {
  if (level === -3) return -2;
  if (level === -2) return -1;
  if (level === -1) return 1;
  if (level >= 1 && level < 12) return level + 1;
  return null;
}

describe('rollover promotion ladder', () => {
  it('maps pre-primary through XII', () => {
    expect(nextLevel(-3)).toBe(-2);
    expect(nextLevel(-1)).toBe(1);
    expect(nextLevel(5)).toBe(6);
    expect(nextLevel(12)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';

import { stackConcessions } from './concession-stack';

describe('stackConcessions', () => {
  const gross = 1_000_000; // ₹10,000.00

  it('stacks sibling + RTE + merit percentages on gross and records each id', () => {
    const result = stackConcessions(
      gross,
      [
        { id: 'sib', type: 'sibling', percentageBp: 1000 }, // 10%
        { id: 'rte', type: 'rte', percentageBp: 2500 }, // 25%
        { id: 'mer', type: 'merit', percentageBp: 500 }, // 5%
      ] as never,
      'head-tuition',
      true,
    );

    // 10% + 25% + 5% of gross = 400_000
    expect(result.concessionAmountPaise).toBe(400_000);
    expect(result.netAmountPaise).toBe(600_000);
    expect(result.appliedConcessionIds).toEqual(['sib', 'rte', 'mer']);
  });

  it('applies flat amounts after percentages and never exceeds gross', () => {
    const result = stackConcessions(
      100_000,
      [
        { id: 'pct', percentageBp: 5000 }, // 50% = 50_000
        { id: 'flat', flatAmountPaise: 80_000 }, // would overflow without cap
      ],
      'head-tuition',
      true,
    );
    expect(result.concessionAmountPaise).toBe(100_000);
    expect(result.netAmountPaise).toBe(0);
    expect(result.appliedConcessionIds).toEqual(['pct', 'flat']);
  });

  it('skips head-restricted concessions for other heads', () => {
    const result = stackConcessions(
      100_000,
      [{ id: 'lab-only', feeHeadId: 'head-lab', percentageBp: 1000 }],
      'head-tuition',
      true,
    );
    expect(result.concessionAmountPaise).toBe(0);
    expect(result.appliedConcessionIds).toEqual([]);
  });

  it('returns zero concession when the head disallows it', () => {
    const result = stackConcessions(
      100_000,
      [{ id: 'sib', percentageBp: 1000 }],
      'head-exam',
      false,
    );
    expect(result.netAmountPaise).toBe(100_000);
    expect(result.appliedConcessionIds).toEqual([]);
  });

  it('uses only integer paise arithmetic (no floats)', () => {
    // 33.33% of 100 = floor(3333/10000 * 100) = 33
    const result = stackConcessions(
      100,
      [{ id: 'x', percentageBp: 3333 }],
      'h',
      true,
    );
    expect(Number.isInteger(result.concessionAmountPaise)).toBe(true);
    expect(result.concessionAmountPaise).toBe(33);
  });
});

import { describe, expect, it } from 'vitest';

import { formatInvoiceNumber } from './billing.constants';

/**
 * Simulates the Postgres INSERT … ON CONFLICT DO UPDATE row lock:
 * concurrent callers must not both read the same last_number.
 */
class AtomicFyCounter {
  private value = 0;
  private chain: Promise<void> = Promise.resolve();

  next(fy: string): Promise<{ fy: string; n: number }> {
    let release!: () => void;
    const prior = this.chain;
    this.chain = new Promise<void>((r) => {
      release = r;
    });
    return prior.then(() => {
      this.value += 1;
      const n = this.value;
      release();
      return { fy, n };
    });
  }
}

describe('invoice number sequencing under concurrent calls', () => {
  it('allocates unique sequential numbers when 40 callers race', async () => {
    const counter = new AtomicFyCounter();
    const fy = '2026-27';
    const results = await Promise.all(Array.from({ length: 40 }, () => counter.next(fy)));
    const numbers = results.map((r) => r.n).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    const formatted = new Set(results.map((r) => formatInvoiceNumber(r.fy, r.n)));
    expect(formatted.size).toBe(40);
  });
});

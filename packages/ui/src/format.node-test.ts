import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatIndianMoney, formatIndianNumber, formatSawDate } from './format.ts';

describe('formatIndianMoney', () => {
  it('formats paise with Indian grouping', () => {
    assert.equal(formatIndianMoney(125050), '₹1,250.50');
    assert.equal(formatIndianMoney(125000000), '₹12,50,000.00');
  });

  it('formats integers with Indian grouping', () => {
    assert.equal(formatIndianNumber(1250000), '12,50,000');
  });
});

describe('formatSawDate', () => {
  it('renders 10 Aug 2026 from ISO date-only', () => {
    assert.equal(formatSawDate('2026-08-10'), '10 Aug 2026');
  });
});

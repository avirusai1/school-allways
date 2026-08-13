import { describe, expect, it } from 'vitest';

import {
  GST_RATE_PERCENT,
  PARENT_SUBSCRIPTION_BASE_PAISE,
  PARENT_SUBSCRIPTION_GST_PAISE,
  PARENT_SUBSCRIPTION_TOTAL_PAISE,
  STAY_CONNECTED_BASE_PAISE,
  STAY_CONNECTED_GST_PAISE,
  STAY_CONNECTED_TOTAL_PAISE,
  financialYearOf,
  formatInvoiceNumber,
  gstSplitFromExclusive,
  gstSplitFromInclusive,
} from './billing.constants';
import { amountInWordsPaise } from './amount-in-words';

describe('GST splits', () => {
  it('parent inclusive: gst = total - base and the three columns sum', () => {
    expect(PARENT_SUBSCRIPTION_TOTAL_PAISE).toBe(36_500);
    expect(PARENT_SUBSCRIPTION_BASE_PAISE).toBe(Math.round(36_500 / 1.18));
    expect(PARENT_SUBSCRIPTION_GST_PAISE).toBe(
      PARENT_SUBSCRIPTION_TOTAL_PAISE - PARENT_SUBSCRIPTION_BASE_PAISE,
    );
    expect(
      PARENT_SUBSCRIPTION_BASE_PAISE + PARENT_SUBSCRIPTION_GST_PAISE,
    ).toBe(PARENT_SUBSCRIPTION_TOTAL_PAISE);
    expect(PARENT_SUBSCRIPTION_BASE_PAISE).toBe(30_932);
    expect(PARENT_SUBSCRIPTION_GST_PAISE).toBe(5_568);
  });

  it('stay connected exclusive: 500 + 18%', () => {
    expect(STAY_CONNECTED_BASE_PAISE).toBe(50_000);
    expect(STAY_CONNECTED_GST_PAISE).toBe(9_000);
    expect(STAY_CONNECTED_TOTAL_PAISE).toBe(59_000);
    expect(GST_RATE_PERCENT).toBe(18);
  });

  it('inclusive intra-state CGST+SGST equals gst with no leftover paise', () => {
    const split = gstSplitFromInclusive(PARENT_SUBSCRIPTION_TOTAL_PAISE, true);
    expect(split.basePaise + split.cgstPaise + split.sgstPaise + split.igstPaise).toBe(
      PARENT_SUBSCRIPTION_TOTAL_PAISE,
    );
    expect(split.igstPaise).toBe(0);
    expect(split.cgstPaise + split.sgstPaise).toBe(PARENT_SUBSCRIPTION_GST_PAISE);
  });

  it('inclusive inter-state is IGST only', () => {
    const split = gstSplitFromInclusive(PARENT_SUBSCRIPTION_TOTAL_PAISE, false);
    expect(split.igstPaise).toBe(PARENT_SUBSCRIPTION_GST_PAISE);
    expect(split.cgstPaise).toBe(0);
    expect(split.sgstPaise).toBe(0);
  });

  it('exclusive intra-state sums to total', () => {
    const split = gstSplitFromExclusive(STAY_CONNECTED_BASE_PAISE, true);
    expect(split.totalPaise).toBe(STAY_CONNECTED_TOTAL_PAISE);
    expect(split.cgstPaise + split.sgstPaise).toBe(STAY_CONNECTED_GST_PAISE);
  });
});

describe('invoice numbers', () => {
  it('formats SAW/FY/seq', () => {
    expect(formatInvoiceNumber('2026-27', 1)).toBe('SAW/2026-27/000001');
    expect(financialYearOf(new Date('2026-08-13T00:00:00+05:30'))).toBe('2026-27');
    expect(financialYearOf(new Date('2026-03-31T12:00:00+05:30'))).toBe('2025-26');
  });
});

describe('amount in words', () => {
  it('names the inclusive parent price', () => {
    expect(amountInWordsPaise(36_500)).toBe('Three Hundred Sixty Five Rupees Only');
  });
});

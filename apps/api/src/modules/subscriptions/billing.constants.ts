/**
 * Parent-paid subscriptions + Stay Connected Fee.
 *
 * Inclusive vs exclusive — do not re-derive these by hand later.
 *
 * Parent subscription is ₹365 GST-INCLUSIVE at 18%:
 *   total = 36500 paise
 *   base  = round(total / 1.18) = 30932
 *   gst   = total - base        = 5568
 * Always derive gst as (total - base) so the three columns sum exactly.
 *
 * Stay Connected Fee is ₹500 GST-EXCLUSIVE at 18%:
 *   base  = 50000
 *   gst   = 9000
 *   total = 59000
 */

export const GST_RATE_PERCENT = 18;

/** ₹365 inclusive. */
export const PARENT_SUBSCRIPTION_TOTAL_PAISE = 36_500;
export const PARENT_SUBSCRIPTION_BASE_PAISE = Math.round(
  PARENT_SUBSCRIPTION_TOTAL_PAISE / (1 + GST_RATE_PERCENT / 100),
);
export const PARENT_SUBSCRIPTION_GST_PAISE =
  PARENT_SUBSCRIPTION_TOTAL_PAISE - PARENT_SUBSCRIPTION_BASE_PAISE;

/** ₹500 exclusive. */
export const STAY_CONNECTED_BASE_PAISE = 50_000;
export const STAY_CONNECTED_GST_PAISE = Math.round(
  STAY_CONNECTED_BASE_PAISE * (GST_RATE_PERCENT / 100),
);
export const STAY_CONNECTED_TOTAL_PAISE =
  STAY_CONNECTED_BASE_PAISE + STAY_CONNECTED_GST_PAISE;

/** Days after tenants.activatedAt during which every student is treated as subscribed. */
export const SUBSCRIPTION_GRACE_DAYS = 30;

/**
 * SAC 998315 — Hosting and IT infrastructure provisioning services.
 * Covers SaaS / cloud subscriptions. Not 998314 (custom IT design/development).
 */
export const INVOICE_SAC_CODE = '998315';

export const ABSENTEE_TEMPLATE_CODE = 'STUDENT_ABSENT';

export function gstSplitFromInclusive(
  totalPaise: number,
  intraState: boolean,
): { basePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number } {
  const basePaise = Math.round(totalPaise / (1 + GST_RATE_PERCENT / 100));
  const gstPaise = totalPaise - basePaise;
  if (intraState) {
    const cgstPaise = Math.floor(gstPaise / 2);
    return { basePaise, cgstPaise, sgstPaise: gstPaise - cgstPaise, igstPaise: 0 };
  }
  return { basePaise, cgstPaise: 0, sgstPaise: 0, igstPaise: gstPaise };
}

export function gstSplitFromExclusive(
  basePaise: number,
  intraState: boolean,
): { basePaise: number; gstPaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number } {
  const gstPaise = Math.round(basePaise * (GST_RATE_PERCENT / 100));
  const totalPaise = basePaise + gstPaise;
  if (intraState) {
    const cgstPaise = Math.floor(gstPaise / 2);
    return {
      basePaise,
      gstPaise,
      cgstPaise,
      sgstPaise: gstPaise - cgstPaise,
      igstPaise: 0,
      totalPaise,
    };
  }
  return { basePaise, gstPaise, cgstPaise: 0, sgstPaise: 0, igstPaise: gstPaise, totalPaise };
}

/** Indian FY: 1 Apr – 31 Mar. */
export function financialYearOf(date: Date): string {
  const y = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  const start = month >= 3 ? y : y - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}

export function formatInvoiceNumber(financialYear: string, seq: number): string {
  return `SAW/${financialYear}/${String(seq).padStart(6, '0')}`;
}

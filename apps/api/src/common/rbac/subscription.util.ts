/**
 * Per-student subscription lock. Mirrors scope.util.ts: the failure mode is
 * LOCKED, never unlocked. A lookup error that accidentally opened the product
 * for every unpaid parent would be worse than wrongly locking one.
 */

export type SubscriptionRowView = {
  status: 'active' | 'expired' | 'refunded' | 'cancelled';
  expiresAt: Date;
};

export type SubscriptionDecisionInput = {
  /** True when the DB call threw, returned malformed data, or timed out. */
  lookupFailed: boolean;
  inGrace: boolean;
  row: SubscriptionRowView | null;
  now: Date;
};

/**
 * Pure unlock decision. Empty/missing/error => locked.
 * Grace short-circuits to unlocked because the school has not yet had time
 * to collect; that is product policy, not a lookup miss.
 */
export function subscriptionUnlocks(input: SubscriptionDecisionInput): boolean {
  if (input.lookupFailed) return false;
  if (input.inGrace) return true;
  if (!input.row) return false;
  if (input.row.status !== 'active') return false;
  if (!(input.row.expiresAt instanceof Date) || Number.isNaN(input.row.expiresAt.getTime())) {
    return false;
  }
  return input.row.expiresAt.getTime() > input.now.getTime();
}

export function isInGracePeriod(
  activatedAt: Date | null,
  now: Date,
  graceDays: number,
): boolean {
  // Clock has not started — the school has not taken first attendance.
  // Locking every parent during onboarding would kill the demo. This is the
  // one intentional fail-open, and it is not a lookup miss.
  if (!activatedAt) return true;
  const ends = new Date(activatedAt.getTime());
  ends.setUTCDate(ends.getUTCDate() + graceDays);
  return now.getTime() < ends.getTime();
}

export function graceEndsAt(activatedAt: Date | null, graceDays: number): Date | null {
  if (!activatedAt) return null;
  const ends = new Date(activatedAt.getTime());
  ends.setUTCDate(ends.getUTCDate() + graceDays);
  return ends;
}

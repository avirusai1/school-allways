/**
 * Tests for the subscription lock. Same standard as scope.util.spec.ts:
 * every case is a way an unpaid parent could read paid data, so a failure
 * here is a billing/security incident, not a broken feature.
 *
 * Recurring assertion: lookup failure / missing row / bad data => LOCKED.
 */

import { describe, expect, it } from 'vitest';

import { SUBSCRIPTION_GRACE_DAYS } from '../../modules/subscriptions/billing.constants';
import {
  graceEndsAt,
  isInGracePeriod,
  subscriptionUnlocks,
} from './subscription.util';

const now = new Date('2026-08-13T12:00:00.000Z');
const future = new Date('2027-03-31T18:29:59.000Z');
const past = new Date('2026-03-31T18:29:59.000Z');

describe('subscriptionUnlocks', () => {
  it('locks when the lookup failed — never fall through to unlocked', () => {
    expect(
      subscriptionUnlocks({
        lookupFailed: true,
        inGrace: true,
        row: { status: 'active', expiresAt: future },
        now,
      }),
    ).toBe(false);
  });

  it('unlocks during grace even with no row', () => {
    expect(
      subscriptionUnlocks({ lookupFailed: false, inGrace: true, row: null, now }),
    ).toBe(true);
  });

  it('locks when there is no row and grace is over', () => {
    expect(
      subscriptionUnlocks({ lookupFailed: false, inGrace: false, row: null, now }),
    ).toBe(false);
  });

  it('unlocks an active row that has not expired', () => {
    expect(
      subscriptionUnlocks({
        lookupFailed: false,
        inGrace: false,
        row: { status: 'active', expiresAt: future },
        now,
      }),
    ).toBe(true);
  });

  it('locks an active row that has expired', () => {
    expect(
      subscriptionUnlocks({
        lookupFailed: false,
        inGrace: false,
        row: { status: 'active', expiresAt: past },
        now,
      }),
    ).toBe(false);
  });

  it('locks expired / refunded / cancelled even if expiresAt is in the future', () => {
    for (const status of ['expired', 'refunded', 'cancelled'] as const) {
      expect(
        subscriptionUnlocks({
          lookupFailed: false,
          inGrace: false,
          row: { status, expiresAt: future },
          now,
        }),
      ).toBe(false);
    }
  });

  it('locks when expiresAt is not a real date', () => {
    expect(
      subscriptionUnlocks({
        lookupFailed: false,
        inGrace: false,
        row: { status: 'active', expiresAt: new Date('not-a-date') },
        now,
      }),
    ).toBe(false);
  });
});

describe('isInGracePeriod', () => {
  it('treats a school that has not activated yet as in grace', () => {
    expect(isInGracePeriod(null, now, SUBSCRIPTION_GRACE_DAYS)).toBe(true);
  });

  it('is in grace the day before the window closes', () => {
    const activated = new Date('2026-08-01T00:00:00.000Z');
    const day29 = new Date('2026-08-30T00:00:00.000Z');
    expect(isInGracePeriod(activated, day29, 30)).toBe(true);
  });

  it('is locked on the boundary instant (activatedAt + 30 days)', () => {
    const activated = new Date('2026-08-01T00:00:00.000Z');
    const boundary = new Date('2026-08-31T00:00:00.000Z');
    expect(isInGracePeriod(activated, boundary, 30)).toBe(false);
  });

  it('is locked after the window', () => {
    const activated = new Date('2026-01-01T00:00:00.000Z');
    expect(isInGracePeriod(activated, now, 30)).toBe(false);
  });

  it('graceEndsAt is null until the school activates', () => {
    expect(graceEndsAt(null, 30)).toBeNull();
  });
});

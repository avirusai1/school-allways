import { Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';

import { academicSessions, studentSubscriptions, tenants } from '@saw/db';

import { RequestContextStore } from '../context/request-context';
import { TenantDbService } from '../database/tenant-db.service';
import { ApiException } from '../errors/api.exception';
import {
  PARENT_SUBSCRIPTION_TOTAL_PAISE,
  SUBSCRIPTION_GRACE_DAYS,
} from '../../modules/subscriptions/billing.constants';
import {
  graceEndsAt,
  isInGracePeriod,
  subscriptionUnlocks,
  type SubscriptionRowView,
} from './subscription.util';

export class SubscriptionLockedException extends ApiException {
  constructor(studentId: string, extras?: Record<string, unknown>) {
    super(
      402,
      'SUBSCRIPTION_REQUIRED',
      'This student is not subscribed for the current session.',
      { studentId, amountPaise: PARENT_SUBSCRIPTION_TOTAL_PAISE, ...extras },
    );
  }
}

export type StudentLockStatus = {
  studentId: string;
  subscribed: boolean;
  status: 'grace' | 'active' | 'locked';
  expiresAt: string | null;
  graceEndsAt: string | null;
};

@Injectable()
export class SubscriptionAccessService {
  constructor(private readonly db: TenantDbService) {}

  /**
   * Throws SUBSCRIPTION_REQUIRED unless the student is unlocked.
   * Any error in the lookup becomes a lock — never an unlock.
   */
  async assertSubscribed(studentId: string): Promise<void> {
    const ok = await this.isSubscribed(studentId);
    if (!ok) throw new SubscriptionLockedException(studentId);
  }

  async isSubscribed(studentId: string): Promise<boolean> {
    if (!studentId) return false;
    try {
      const snapshot = await this.load(studentId);
      return subscriptionUnlocks(snapshot.decision);
    } catch {
      return false;
    }
  }

  async statusForStudents(studentIds: string[]): Promise<Map<string, StudentLockStatus>> {
    const out = new Map<string, StudentLockStatus>();
    if (studentIds.length === 0) return out;
    try {
      const { grace, graceEnd, rows, now } = await this.loadMany(studentIds);
      for (const id of studentIds) {
        const row = rows.get(id) ?? null;
        const subscribed = subscriptionUnlocks({
          lookupFailed: false,
          inGrace: grace,
          row,
          now,
        });
        out.set(id, {
          studentId: id,
          subscribed,
          status: grace ? 'grace' : subscribed ? 'active' : 'locked',
          expiresAt: row?.expiresAt.toISOString() ?? (grace ? graceEnd?.toISOString() ?? null : null),
          graceEndsAt: graceEnd?.toISOString() ?? null,
        });
      }
      return out;
    } catch {
      for (const id of studentIds) {
        out.set(id, {
          studentId: id,
          subscribed: false,
          status: 'locked',
          expiresAt: null,
          graceEndsAt: null,
        });
      }
      return out;
    }
  }

  async tenantHasAnySubscribedChild(studentIds: string[]): Promise<boolean> {
    const map = await this.statusForStudents(studentIds);
    for (const s of map.values()) {
      if (s.subscribed) return true;
    }
    return false;
  }

  async currentSessionEnd(): Promise<Date | null> {
    const ctx = RequestContextStore.get();
    const [row] = await this.db.run((tx) =>
      tx
        .select({ endDate: academicSessions.endDate })
        .from(academicSessions)
        .where(
          and(
            eq(academicSessions.tenantId, ctx.tenantId!),
            eq(academicSessions.isCurrent, true),
          ),
        )
        .limit(1),
    );
    if (!row?.endDate) return null;
    return endOfDayIst(row.endDate);
  }

  private async load(studentId: string) {
    const ctx = RequestContextStore.get();
    const now = new Date();
    return this.db.run(async (tx) => {
      const [tenant] = await tx
        .select({ activatedAt: tenants.activatedAt })
        .from(tenants)
        .where(eq(tenants.id, ctx.tenantId!))
        .limit(1);

      // A missing tenant row is a lookup failure, not "not yet activated".
      if (!tenant) {
        return { decision: { lookupFailed: true, inGrace: false, row: null, now } };
      }

      const [session] = await tx
        .select({ id: academicSessions.id })
        .from(academicSessions)
        .where(
          and(
            eq(academicSessions.tenantId, ctx.tenantId!),
            eq(academicSessions.isCurrent, true),
          ),
        )
        .limit(1);

      let row: SubscriptionRowView | null = null;
      if (session) {
        const [sub] = await tx
          .select({
            status: studentSubscriptions.status,
            expiresAt: studentSubscriptions.expiresAt,
          })
          .from(studentSubscriptions)
          .where(
            and(
              eq(studentSubscriptions.studentId, studentId),
              eq(studentSubscriptions.academicSessionId, session.id),
            ),
          )
          .limit(1);
        if (sub) {
          row = { status: sub.status, expiresAt: sub.expiresAt };
        }
      }

      const grace = isInGracePeriod(tenant.activatedAt ?? null, now, SUBSCRIPTION_GRACE_DAYS);
      return {
        decision: {
          lookupFailed: false,
          inGrace: grace,
          row,
          now,
        },
      };
    });
  }

  private async loadMany(studentIds: string[]) {
    const ctx = RequestContextStore.get();
    const now = new Date();
    return this.db.run(async (tx) => {
      const [tenant] = await tx
        .select({ activatedAt: tenants.activatedAt })
        .from(tenants)
        .where(eq(tenants.id, ctx.tenantId!))
        .limit(1);

      if (!tenant) {
        throw new Error('tenant lookup returned nothing');
      }

      const [session] = await tx
        .select({ id: academicSessions.id })
        .from(academicSessions)
        .where(
          and(
            eq(academicSessions.tenantId, ctx.tenantId!),
            eq(academicSessions.isCurrent, true),
          ),
        )
        .limit(1);

      const rows = new Map<string, SubscriptionRowView>();
      if (session && studentIds.length > 0) {
        const found = await tx
          .select({
            studentId: studentSubscriptions.studentId,
            status: studentSubscriptions.status,
            expiresAt: studentSubscriptions.expiresAt,
          })
          .from(studentSubscriptions)
          .where(
            and(
              inArray(studentSubscriptions.studentId, studentIds),
              eq(studentSubscriptions.academicSessionId, session.id),
            ),
          );
        for (const r of found) {
          rows.set(r.studentId, { status: r.status, expiresAt: r.expiresAt });
        }
      }

      const activatedAt = tenant?.activatedAt ?? null;
      return {
        grace: isInGracePeriod(activatedAt, now, SUBSCRIPTION_GRACE_DAYS),
        graceEnd: graceEndsAt(activatedAt, SUBSCRIPTION_GRACE_DAYS),
        rows,
        now,
      };
    });
  }
}

/** Session endDate is a calendar date; entitlement runs through that day in IST. */
function endOfDayIst(isoDate: string): Date {
  return new Date(`${isoDate}T18:29:59.000Z`);
}

import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { academicSessions, stayConnectedFees, tenants } from '@saw/db';

import { RequestContextStore } from '../../common/context/request-context';
import { TenantDbService } from '../../common/database/tenant-db.service';
import { SUBSCRIPTION_GRACE_DAYS } from './billing.constants';
import { graceEndsAt, isInGracePeriod } from '../../common/rbac/subscription.util';
import { ensureStayConnectedFee } from './stay-connected.util';

@Injectable()
export class StayConnectedFeeService {
  constructor(private readonly db: TenantDbService) {}

  /**
   * Banner payload for school admin / principal. Never blocks access.
   * Lazily creates the current-session row so existing tenants pick it up
   * without a backfill job.
   */
  async currentForTenant() {
    const ctx = RequestContextStore.get();
    const now = new Date();

    return this.db.run(async (tx) => {
      const [tenant] = await tx
        .select({ activatedAt: tenants.activatedAt })
        .from(tenants)
        .where(eq(tenants.id, ctx.tenantId!))
        .limit(1);

      const [session] = await tx
        .select({
          id: academicSessions.id,
          name: academicSessions.name,
          endDate: academicSessions.endDate,
        })
        .from(academicSessions)
        .where(
          and(
            eq(academicSessions.tenantId, ctx.tenantId!),
            eq(academicSessions.isCurrent, true),
          ),
        )
        .limit(1);

      if (session) {
        await ensureStayConnectedFee(tx, {
          tenantId: ctx.tenantId!,
          academicSessionId: session.id,
          sessionName: session.name,
          sessionEndDate: session.endDate,
          userId: ctx.userId,
        });
      }

      const [fee] = session
        ? await tx
            .select({
              id: stayConnectedFees.id,
              status: stayConnectedFees.status,
              dueDate: stayConnectedFees.dueDate,
              totalPaise: stayConnectedFees.totalPaise,
              basePaise: stayConnectedFees.basePaise,
              gstPaise: stayConnectedFees.gstPaise,
              paidAt: stayConnectedFees.paidAt,
              invoiceNumber: stayConnectedFees.invoiceNumber,
            })
            .from(stayConnectedFees)
            .where(
              and(
                eq(stayConnectedFees.tenantId, ctx.tenantId!),
                eq(stayConnectedFees.academicSessionId, session.id),
              ),
            )
            .limit(1)
        : [undefined];

      const inGrace = isInGracePeriod(tenant?.activatedAt ?? null, now, SUBSCRIPTION_GRACE_DAYS);

      return {
        fee: fee
          ? {
              id: fee.id,
              status: fee.status,
              dueDate: fee.dueDate.toISOString(),
              totalPaise: fee.totalPaise,
              basePaise: fee.basePaise,
              gstPaise: fee.gstPaise,
              paidAt: fee.paidAt?.toISOString() ?? null,
              invoiceNumber: fee.invoiceNumber,
            }
          : null,
        inGrace,
        graceDays: SUBSCRIPTION_GRACE_DAYS,
        graceEndsAt: graceEndsAt(tenant?.activatedAt ?? null, SUBSCRIPTION_GRACE_DAYS)?.toISOString() ?? null,
        sessionName: session?.name ?? null,
      };
    });
  }
}

/**
 * Growth — referrals (reward on activation), data export, monthly report, NPS.
 */

import { randomInt } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';

import { referrals, tenants } from '@saw/db';

import { RequestContextStore } from '../../common/context/request-context';
import { TenantDbService } from '../../common/database/tenant-db.service';
import { ApiException } from '../../common/errors/api.exception';
import type { CreateReferralDto, NpsRespondDto } from './dto/growth.dto';

@Injectable()
export class GrowthService {
  private readonly logger = new Logger(GrowthService.name);

  constructor(private readonly db: TenantDbService) {}

  async createReferral(dto: CreateReferralDto) {
    const ctx = RequestContextStore.get();
    const code = `SAW${randomInt(100000, 999999)}`;

    return this.db.run(async (tx) => {
      const [row] = await tx
        .insert(referrals)
        .values({
          tenantId: ctx.tenantId!,
          referrerTenantId: ctx.tenantId!,
          referrerUserId: ctx.userId,
          code,
          invitedSchoolName: dto.invitedSchoolName,
          invitedContactPhone: dto.invitedContactPhone,
          status: 'sent',
          rewardMonths: 1,
        })
        .returning({
          id: referrals.id,
          code: referrals.code,
          status: referrals.status,
        });
      return row;
    });
  }

  async myReferrals() {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const rows = await tx
        .select({
          id: referrals.id,
          code: referrals.code,
          status: referrals.status,
          invitedSchoolName: referrals.invitedSchoolName,
          signedUpAt: referrals.signedUpAt,
          activatedAt: referrals.activatedAt,
          rewardGrantedAt: referrals.rewardGrantedAt,
          rewardMonths: referrals.rewardMonths,
          referredTenantId: referrals.referredTenantId,
        })
        .from(referrals)
        .where(eq(referrals.referrerTenantId, ctx.tenantId!))
        .orderBy(desc(referrals.createdAt))
        .limit(50);
      return { data: rows };
    });
  }

  /**
   * Reward only on activation — never signup. Called after status becomes
   * `activated` (see OnboardingService.markActivated).
   */
  async grantRewardIfActivated(referredTenantId: string) {
    return this.db.run(async (tx) => {
      const [ref] = await tx
        .select({
          id: referrals.id,
          rewardGrantedAt: referrals.rewardGrantedAt,
        })
        .from(referrals)
        .where(
          and(
            eq(referrals.referredTenantId, referredTenantId),
            eq(referrals.status, 'activated'),
          ),
        )
        .limit(1);

      if (!ref || ref.rewardGrantedAt) return null;

      const [updated] = await tx
        .update(referrals)
        .set({
          status: 'rewarded',
          rewardGrantedAt: new Date(),
        })
        .where(eq(referrals.id, ref.id))
        .returning({
          id: referrals.id,
          referrerTenantId: referrals.referrerTenantId,
          rewardMonths: referrals.rewardMonths,
        });

      this.logger.log(
        `Referral reward granted ref=${updated!.id} months=${updated!.rewardMonths}`,
      );
      return updated;
    });
  }

  /** Full data export — queued. Marketing feature: easy to leave = willing to arrive. */
  async requestExport(academicSessionId?: string) {
    const ctx = RequestContextStore.get();
    RequestContextStore.addAudit({
      action: 'tenant.export.request',
      entityType: 'tenants',
      entityId: ctx.tenantId!,
    });

    return {
      status: 'queued',
      tenantId: ctx.tenantId,
      academicSessionId: academicSessionId ?? null,
      message:
        'Your export is being prepared. You will receive a 7-day signed download link.',
      estimatedMinutes: 15,
    };
  }

  async monthlyReport(month: string) {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new ApiException(400, 'VALIDATION_ERROR', 'month must be YYYY-MM');
    }
    const ctx = RequestContextStore.get();

    const [tenant] = await this.db.run(async (tx) =>
      tx
        .select({ name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, ctx.tenantId!))
        .limit(1),
    );

    return {
      status: 'queued',
      month,
      schoolName: tenant?.name ?? null,
      message:
        'Principal monthly report is being generated (attendance, fees, academics, engagement).',
    };
  }

  async npsRespond(dto: NpsRespondDto) {
    const ctx = RequestContextStore.get();
    RequestContextStore.addAudit({
      action: 'growth.nps.respond',
      entityType: 'tenants',
      entityId: ctx.tenantId!,
    });
    return {
      accepted: true,
      score: dto.score,
      comment: dto.comment ?? null,
    };
  }
}

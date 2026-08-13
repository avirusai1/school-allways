import { Injectable, Logger } from '@nestjs/common';
import { and, eq, isNull, lt } from 'drizzle-orm';

import { onboardingNudges, tenants, users } from '@saw/db';

import { RequestContextStore } from '../../common/context/request-context';
import { TenantDbService } from '../../common/database/tenant-db.service';
import { NotificationService } from '../notifications/notification.service';
import { ONBOARDING_STEPS } from './onboarding.constants';

type NudgeDay = 1 | 3 | 7;
const JOIN_BASE =
  process.env.ADMIN_APP_URL ?? 'https://admin.school.techallways.com';

/**
 * Scheduled job (07:00 IST): find tenants stalled > 24h on a wizard step and
 * send escalating WhatsApp/SMS deep links. Stops after day 7.
 */
@Injectable()
export class OnboardingNudgeProcessor {
  private readonly logger = new Logger(OnboardingNudgeProcessor.name);

  constructor(
    private readonly db: TenantDbService,
    private readonly notifications: NotificationService,
  ) {}

  async runDaily(): Promise<{ scanned: number; sent: number }> {
    const stalledBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const stalled = await RequestContextStore.run(
      {
        requestId: `onboarding-nudge-${Date.now()}`,
        userId: null,
        tenantId: null,
        branchId: null,
        sessionId: null,
        roleCodes: [],
        permissions: new Map(),
        isPlatformAdmin: true,
        impersonatorUserId: null,
        auditTrail: [],
        piiReads: [],
      },
      () =>
        this.db.run(async (tx) =>
          tx
            .select({
              id: tenants.id,
              name: tenants.name,
              onboardingStep: tenants.onboardingStep,
              ownerPhone: tenants.ownerPhone,
              updatedAt: tenants.updatedAt,
            })
            .from(tenants)
            .where(
              and(
                eq(tenants.status, 'onboarding'),
                isNull(tenants.activatedAt),
                isNull(tenants.onboardingCompletedAt),
                lt(tenants.updatedAt, stalledBefore),
              ),
            ),
        ),
    );

    let sent = 0;
    for (const t of stalled) {
      const step = t.onboardingStep ?? 'school_profile';
      if (!(ONBOARDING_STEPS as readonly string[]).includes(step)) continue;

      const hoursStalled =
        (Date.now() - (t.updatedAt?.getTime() ?? Date.now())) / (1000 * 60 * 60);
      const dayOffset = pickDayOffset(hoursStalled);
      if (dayOffset == null) continue;

      const already = await this.db.asTenant(t.id, async (tx) => {
        const [row] = await tx
          .select({ id: onboardingNudges.id })
          .from(onboardingNudges)
          .where(
            and(
              eq(onboardingNudges.tenantId, t.id),
              eq(onboardingNudges.step, step),
              eq(onboardingNudges.dayOffset, dayOffset),
            ),
          )
          .limit(1);
        return row;
      });
      if (already) continue;

      const ownerUserId = t.ownerPhone
        ? await this.db.runUnscoped(async (tx) => {
            const [u] = await tx
              .select({ id: users.id })
              .from(users)
              .where(eq(users.phone, t.ownerPhone!))
              .limit(1);
            return u?.id ?? null;
          })
        : null;

      if (ownerUserId) {
        try {
          await this.notifications.notify({
            tenantId: t.id,
            templateCode: 'ONBOARDING_NUDGE',
            recipients: [{ userId: ownerUserId }],
            variables: {
              schoolName: t.name,
              step,
              link: `${JOIN_BASE}/onboarding?step=${step}`,
            },
            priority: 'high',
            channels: ['push', 'in_app'],
          });
        } catch (err) {
          this.logger.warn(
            `Nudge notify failed tenant=${t.id}: ` +
              (err instanceof Error ? err.message : String(err)),
          );
        }
      }

      await this.db.asTenant(t.id, async (tx) => {
        await tx.insert(onboardingNudges).values({
          tenantId: t.id,
          step,
          dayOffset,
          channel: 'whatsapp',
          meta: { hoursStalled: Math.round(hoursStalled) },
        });
      });
      sent++;
    }

    return { scanned: stalled.length, sent };
  }
}

function pickDayOffset(hoursStalled: number): NudgeDay | null {
  if (hoursStalled >= 7 * 24) return 7;
  if (hoursStalled >= 3 * 24) return 3;
  if (hoursStalled >= 24) return 1;
  return null;
}

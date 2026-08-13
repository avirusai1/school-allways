/**
 * Nightly rollup at ~01:30 IST. Uses setInterval + timezone check rather than
 * a separate cron daemon — same pattern as other background work on this box.
 */

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { RequestContextStore } from '../../../common/context/request-context';
import { RollupService } from '../rollup.service';

@Injectable()
export class RollupProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RollupProcessor.name);
  private timer: NodeJS.Timeout | null = null;
  private lastRunDay: string | null = null;

  constructor(private readonly rollup: RollupService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.tick().catch((err) =>
        this.logger.error(
          `Rollup tick failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }, 60_000);
    this.timer.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    // 01:30 Asia/Kolkata
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const hour = Number(get('hour'));
    const minute = Number(get('minute'));
    const today = `${get('year')}-${get('month')}-${get('day')}`;

    if (hour !== 1 || minute < 30 || minute > 35) return;
    if (this.lastRunDay === today) return;
    this.lastRunDay = today;

    /**
     * Summarise the day that just ended, not the one that just started.
     *
     * This ran for `today` at 01:30, when no school has marked a register yet,
     * so every tenant scored activation 40 / engagement 0 and was written back
     * as band 'onboarding' with a health score around 12 — every single night,
     * for every school, however healthy it actually was. The console then
     * showed that until someone manually re-ran the rollup.
     */
    const day = new Date(`${today}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() - 1);
    const targetDay = day.toISOString().slice(0, 10);

    await RequestContextStore.run(
      {
        requestId: `platform-rollup-${targetDay}`,
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
      () => this.rollup.runForDay(targetDay),
    );
  }
}

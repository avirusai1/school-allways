/**
 * The consumer for the `notifications` queue, plus a sweeper for rows the queue
 * never got.
 *
 * Workers run in-process on every API instance via OnModuleInit — there is no
 * separate `worker` entrypoint. Splitting them out is deferred until a
 * single-instance deployment shows it needs it; until then `pnpm --filter
 * @saw/api start` is the only process that processes the queue.
 *
 * The sweeper is not belt-and-braces. A queue write can fail — Redis restarts,
 * the job id collides, the process dies between the ledger insert and the
 * enqueue — and without it those rows sit at `queued` forever with nothing
 * watching. That is precisely the failure this whole module was built to fix,
 * so the recovery path is part of the design rather than an afterthought.
 */

import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';

import { deliveryAttempts, tenants } from '@saw/db';

import { RequestContextStore } from '../../../common/context/request-context';
import { TenantDbService } from '../../../common/database/tenant-db.service';
import { REDIS_CLIENT } from '../../../common/redis/redis.constants';
import {
  NotificationDispatchService,
  type DispatchJob,
  type DispatchTarget,
} from '../notification-dispatch.service';
import { NOTIFICATIONS_QUEUE, NotificationService } from '../notification.service';
import type { NotifyChannel } from '../notification.types';
import {
  NOTIFICATION_PROVIDER,
  type NotificationProvider,
} from '../providers/notification-provider';

/** How long a row may sit unclaimed before the sweeper assumes its job is lost. */
const STALE_AFTER_MS = 2 * 60_000;
/**
 * Every minute would mean a cross-tenant tenant list plus two queries per
 * school every minute, forever, to find nothing almost every time. Five
 * minutes is well inside the 45-minute escalation window and still recovers a
 * lost job long before anybody notices.
 */
const SWEEP_INTERVAL_MS = 5 * 60_000;
const SWEEP_BATCH = 500;

@Injectable()
export class NotificationFanOutProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationFanOutProcessor.name);
  private worker: Worker | null = null;
  private sweepTimer: NodeJS.Timeout | null = null;
  private sweeping = false;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(NOTIFICATION_PROVIDER) private readonly provider: NotificationProvider,
    private readonly config: ConfigService,
    private readonly db: TenantDbService,
    private readonly dispatch: NotificationDispatchService,
    private readonly notifications: NotificationService,
  ) {}

  onModuleInit(): void {
    if (this.provider.isStub) {
      this.logger.warn(
        `Notification provider is '${this.provider.name}' — messages are written to ` +
          'the log and the delivery ledger, but nothing reaches a real phone.',
      );
    }

    try {
      this.worker = new Worker<DispatchJob>(
        NOTIFICATIONS_QUEUE,
        async (job: Job<DispatchJob>) => {
          const result = await this.dispatch.dispatch(job.data);
          this.logger.log(
            `Notify job ${job.id} (${job.data.templateCode}): ` +
              `sent=${result.sent} failed=${result.failed} skipped=${result.skipped}`,
          );
          return result;
        },
        {
          connection: this.redis.duplicate({ maxRetriesPerRequest: null }),
          // Provider calls are network-bound, not CPU-bound; 4 keeps a 400-parent
          // fan-out moving without crowding the request path on 2 vCPU.
          concurrency: 4,
        },
      );
      this.worker.on('failed', (job, err) => {
        this.logger.error(`Notify job ${job?.id} failed: ${err.message}`);
      });
    } catch (err) {
      this.logger.warn(
        `Notification worker not started: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    this.sweepTimer = setInterval(() => {
      void this.sweep().catch((err) =>
        this.logger.error(
          `Notification sweep failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }, SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    await this.worker?.close();
  }

  /**
   * Picks up abandoned rows, then advances the push → SMS ladder, one school at
   * a time. `delivery_attempts` is tenant-scoped, so there is no single query
   * that sees every school's backlog without platform-admin context — and the
   * per-tenant walk is the same shape the nightly platform rollup uses.
   */
  async sweep(): Promise<{ recovered: number; escalated: number }> {
    if (this.sweeping) return { recovered: 0, escalated: 0 };
    this.sweeping = true;
    try {
      let recovered = 0;
      let escalated = 0;

      for (const tenantId of await this.activeTenantIds()) {
        recovered += await this.recoverStale(tenantId);
        escalated += await this.runEscalationLadder(tenantId);
      }

      if (recovered > 0 || escalated > 0) {
        this.logger.log(
          `Notification sweep: recovered=${recovered} escalated=${escalated}`,
        );
      }
      return { recovered, escalated };
    } finally {
      this.sweeping = false;
    }
  }

  private async activeTenantIds(): Promise<string[]> {
    return RequestContextStore.run(
      {
        requestId: 'notification-sweep',
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
      async () => {
        const rows = await this.db.run((tx) =>
          tx
            .select({ id: tenants.id })
            .from(tenants)
            .where(and(eq(tenants.isActive, true), isNull(tenants.deletedAt))),
        );
        return rows.map((r) => r.id);
      },
    );
  }

  private async recoverStale(tenantId: string): Promise<number> {
    const cutoff = new Date(Date.now() - STALE_AFTER_MS);

    const stale = await this.db.asTenant(tenantId, (tx) =>
      tx
        .select({
          id: deliveryAttempts.id,
          userId: deliveryAttempts.recipientUserId,
          channel: deliveryAttempts.channel,
          templateCode: deliveryAttempts.templateCode,
        })
        .from(deliveryAttempts)
        .where(
          and(
            eq(deliveryAttempts.status, 'queued'),
            lt(deliveryAttempts.queuedAt, cutoff),
          ),
        )
        .limit(SWEEP_BATCH),
    );

    if (stale.length === 0) return 0;

    const byTemplate = new Map<string, typeof stale>();
    for (const row of stale) {
      const key = row.templateCode ?? '';
      const list = byTemplate.get(key);
      if (list) list.push(row);
      else byTemplate.set(key, [row]);
    }

    let recovered = 0;
    for (const [templateCode, rows] of byTemplate) {
      const targets: DispatchTarget[] = rows.map((r) => ({
        attemptId: r.id,
        userId: r.userId,
        channel: r.channel as NotifyChannel,
        // The original variables are gone with the lost job. The template still
        // renders; a placeholder simply resolves to empty rather than blocking
        // an alert that is already late.
        variables: {},
      }));

      await this.dispatch.dispatch({
        tenantId,
        templateCode: templateCode || 'UNKNOWN',
        priority: 'normal',
        variables: {},
        scheduledFor: null,
        targets,
      });
      recovered += targets.length;
    }
    return recovered;
  }

  private async runEscalationLadder(tenantId: string): Promise<number> {
    const minutes = this.config.get<number>('SMS_ESCALATION_MINUTES') ?? 45;
    const cutoff = new Date(Date.now() - minutes * 60_000);
    const settled = new Date(Date.now() - 60_000);

    const candidates = await this.db.asTenant(tenantId, (tx) =>
      tx
        .select({ id: deliveryAttempts.id })
        .from(deliveryAttempts)
        .where(
          and(
            eq(deliveryAttempts.channel, 'push'),
            eq(deliveryAttempts.attemptNo, 0),
            isNull(deliveryAttempts.readAt),
            inArray(deliveryAttempts.priority, ['high', 'critical']),
            or(
              // Delivered, but nobody opened it inside the window.
              and(
                inArray(deliveryAttempts.status, ['sent', 'delivered']),
                lt(deliveryAttempts.sentAt, cutoff),
              ),
              // Never left the building — the parent has no device registered.
              // Waiting out a 45-minute window for a push that was never sent
              // just delays the SMS that was always going to be needed.
              and(
                eq(deliveryAttempts.status, 'skipped'),
                lt(deliveryAttempts.createdAt, settled),
              ),
            ),
            // Only once per row: an escalation writes a child row pointing back.
            sql`not exists (
              select 1 from delivery_attempts child
              where child.escalated_from_id = ${deliveryAttempts.id}
            )`,
          ),
        )
        .limit(SWEEP_BATCH),
    );

    let escalated = 0;
    for (const row of candidates) {
      const outcome = await this.notifications.escalateUnread(tenantId, row.id);
      if (outcome === 'escalated') escalated += 1;
    }

    // The escalation wrote new `queued` SMS rows. Nothing has queued a job for
    // them, so the next pass of recoverStale is what actually sends them.
    return escalated;
  }
}

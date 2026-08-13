import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { and, eq, sql } from 'drizzle-orm';

import { deliveryAttempts, tenantSettings } from '@saw/db';

import { TenantDbService } from '../../common/database/tenant-db.service';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import type { DispatchTarget } from './notification-dispatch.service';
import {
  isPaidChannel,
  type NotifyChannel,
  type NotifyPriority,
  type NotifyRequest,
} from './notification.types';
import { isInQuietHours, nextQuietHoursEnd, renderTemplate } from './quiet-hours.util';

export const NOTIFICATIONS_QUEUE = 'notifications';

export type {
  NotifyChannel,
  NotifyPriority,
  NotifyRecipient,
  NotifyRequest,
} from './notification.types';

/** Ledger rows per queue job. Keeps a 400-parent circular off a 1 MB payload. */
const TARGETS_PER_JOB = 200;

/**
 * Splits on recipient boundaries, never mid-recipient.
 *
 * The paid-channel ladder can only stop at the first success if one worker sees
 * all of a person's channels together. Slicing a flat list at a fixed size puts
 * a parent's WhatsApp row in one job and their SMS row in another, and both
 * jobs then send — the school pays twice to tell one parent one thing.
 */
function chunkByRecipient(
  targets: DispatchTarget[],
  limit: number,
): DispatchTarget[][] {
  const byUser = new Map<string, DispatchTarget[]>();
  for (const t of targets) {
    const list = byUser.get(t.userId);
    if (list) list.push(t);
    else byUser.set(t.userId, [t]);
  }

  const chunks: DispatchTarget[][] = [];
  let current: DispatchTarget[] = [];
  for (const group of byUser.values()) {
    if (current.length > 0 && current.length + group.length > limit) {
      chunks.push(current);
      current = [];
    }
    current.push(...group);
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Decides who gets told what on which channel, writes that decision to the
 * delivery ledger, and hands the sending to the worker. Returns in < 20 ms with
 * zero provider I/O on the request path.
 *
 * The ledger is written BEFORE the job is queued, deliberately. A row that
 * exists but was never picked up is a visible backlog the sweeper can retry; a
 * job that was queued without a row is a message nobody can account for.
 */
@Injectable()
export class NotificationService implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationService.name);
  private queue: Queue | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly db: TenantDbService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  private getQueue(): Queue {
    if (!this.queue) {
      this.queue = new Queue(NOTIFICATIONS_QUEUE, {
        connection: this.redis.duplicate({ maxRetriesPerRequest: null }),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: 200,
          removeOnFail: 500,
        },
      });
    }
    return this.queue;
  }

  async notify(req: NotifyRequest): Promise<{ queued: number; deferred: boolean }> {
    if (req.recipients.length === 0) return { queued: 0, deferred: false };

    const priority = req.priority ?? 'normal';
    const requested = req.channels ?? ['push', 'in_app'];
    const quiet = await this.resolveQuietHours(req.tenantId);

    let scheduledFor = req.scheduledFor ?? null;
    let deferred = false;

    if (
      priority !== 'critical' &&
      !scheduledFor &&
      isInQuietHours(new Date(), quiet.start, quiet.end)
    ) {
      scheduledFor = nextQuietHoursEnd(new Date(), quiet.end);
      deferred = true;
    }

    const channels = this.channelsToWriteNow(requested);
    const targets = await this.insertAttempts(req, channels, priority, scheduledFor);
    await this.enqueue(req, priority, scheduledFor, targets);

    return { queued: req.recipients.length, deferred };
  }

  /**
   * Push and SMS asked for together means "push, and fall back to SMS if it
   * goes unread" — that is the whole point of the ladder and most of the
   * savings. Only write the paid rows up front when there is no push to wait on
   * (an invitation to somebody who has no app yet is the usual case).
   */
  private channelsToWriteNow(requested: NotifyChannel[]): NotifyChannel[] {
    const unique = [...new Set(requested)];
    const hasPush = unique.includes('push');
    const channels = unique.filter((c) => !hasPush || !isPaidChannel(c));
    return channels.length > 0 ? channels : ['push'];
  }

  private async enqueue(
    req: NotifyRequest,
    priority: NotifyPriority,
    scheduledFor: Date | null,
    targets: DispatchTarget[],
  ): Promise<void> {
    if (targets.length === 0) return;

    for (const chunk of chunkByRecipient(targets, TARGETS_PER_JOB)) {
      try {
        await this.getQueue().add(
          'fan-out',
          {
            tenantId: req.tenantId,
            templateCode: req.templateCode,
            priority,
            variables: req.variables ?? {},
            scheduledFor: scheduledFor?.toISOString() ?? null,
            announcementId: req.announcementId,
            messageId: req.messageId,
            targets: chunk,
          },
          {
            delay: scheduledFor ? Math.max(0, scheduledFor.getTime() - Date.now()) : 0,
            // Derived from the ledger rows, so a retry of the same send cannot
            // produce a second job for rows that are already being worked.
            jobId: `notify-${chunk[0]!.attemptId}`,
          },
        );
      } catch (err) {
        // The rows stay `queued`; the sweeper will pick them up. Loud, because
        // a queue that is refusing writes is not a normal condition.
        this.logger.error(
          `Failed to enqueue notify template=${req.templateCode} rows=${chunk.length}: ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }
  }

  /**
   * Escalation ladder tick: unread high/critical push after the window → SMS.
   * Called by the sweeper; a read row becomes `suppressed` (money saved).
   *
   * Runs inside the tenant, not unscoped: `delivery_attempts` is tenant-scoped
   * and RLS returns nothing without a tenant set, so an unscoped read here
   * would find no candidates and the ladder would never fire.
   */
  async escalateUnread(
    tenantId: string,
    attemptId: string,
  ): Promise<'escalated' | 'suppressed' | 'skipped'> {
    return this.db.asTenant(tenantId, async (tx) => {
      const [row] = await tx
        .select({
          id: deliveryAttempts.id,
          tenantId: deliveryAttempts.tenantId,
          recipientUserId: deliveryAttempts.recipientUserId,
          templateCode: deliveryAttempts.templateCode,
          priority: deliveryAttempts.priority,
          status: deliveryAttempts.status,
          readAt: deliveryAttempts.readAt,
          announcementId: deliveryAttempts.announcementId,
          messageId: deliveryAttempts.messageId,
          channel: deliveryAttempts.channel,
          attemptNo: deliveryAttempts.attemptNo,
        })
        .from(deliveryAttempts)
        .where(eq(deliveryAttempts.id, attemptId))
        .limit(1);

      if (!row || row.channel !== 'push' || row.attemptNo !== 0) return 'skipped';
      if (row.priority !== 'high' && row.priority !== 'critical') return 'skipped';

      if (row.readAt) {
        await tx
          .update(deliveryAttempts)
          .set({ status: 'suppressed' })
          .where(eq(deliveryAttempts.id, attemptId));
        return 'suppressed';
      }

      // Daily SMS cap — stop rather than blow the bill.
      const cap = this.config.get<number>('SMS_DAILY_CAP_PER_TENANT') ?? 2000;
      const used = await this.smsUsedToday(tx, row.tenantId);
      if (used >= cap) {
        await tx
          .update(deliveryAttempts)
          .set({
            status: 'suppressed',
            failureReason: 'Daily SMS cap reached',
          })
          .where(eq(deliveryAttempts.id, attemptId));
        this.logger.warn(
          `SMS cap hit tenant=${row.tenantId} used=${used} cap=${cap}`,
        );
        return 'suppressed';
      }

      await tx.insert(deliveryAttempts).values({
        tenantId: row.tenantId,
        announcementId: row.announcementId,
        messageId: row.messageId,
        templateCode: row.templateCode,
        recipientUserId: row.recipientUserId,
        channel: 'sms',
        status: 'queued',
        priority: row.priority,
        attemptNo: 1,
        escalatedFromId: row.id,
      });

      return 'escalated';
    });
  }

  async markRead(attemptId: string, userId: string): Promise<void> {
    await this.db.run(async (tx) => {
      await tx
        .update(deliveryAttempts)
        .set({ status: 'read', readAt: sql`now()` })
        .where(
          and(
            eq(deliveryAttempts.id, attemptId),
            eq(deliveryAttempts.recipientUserId, userId),
          ),
        );
    });
  }

  /**
   * One ledger row per (recipient, channel), inserted in chunks of 500 and
   * returned so the queue job can address exactly the rows it owns.
   */
  private async insertAttempts(
    req: NotifyRequest,
    channels: NotifyChannel[],
    priority: NotifyPriority,
    scheduledFor: Date | null,
  ): Promise<DispatchTarget[]> {
    const rows = req.recipients.flatMap((r) =>
      channels.map((channel) => ({
        tenantId: req.tenantId,
        announcementId: req.announcementId ?? null,
        messageId: req.messageId ?? null,
        templateCode: req.templateCode,
        recipientUserId: r.userId,
        channel: channel as never,
        status: 'queued' as const,
        priority: priority as never,
        attemptNo: 0,
        queuedAt: scheduledFor ?? new Date(),
        variables: { ...(req.variables ?? {}), ...(r.variables ?? {}) },
      })),
    );
    if (rows.length === 0) return [];

    const CHUNK = 500;
    const targets: DispatchTarget[] = [];
    await this.db.asTenant(req.tenantId, async (tx) => {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const inserted = await tx
          .insert(deliveryAttempts)
          .values(rows.slice(i, i + CHUNK))
          .returning({
            id: deliveryAttempts.id,
            userId: deliveryAttempts.recipientUserId,
            channel: deliveryAttempts.channel,
            variables: deliveryAttempts.variables,
          });
        for (const row of inserted) {
          targets.push({
            attemptId: row.id,
            userId: row.userId,
            channel: row.channel as NotifyChannel,
            // Per-row variables, not last-write-wins per user — two absent
            // children of one parent must each keep their own studentId.
            variables: (row.variables ?? {}) as Record<string, string>,
          });
        }
      }
    });
    return targets;
  }

  private async resolveQuietHours(
    tenantId: string,
  ): Promise<{ start: string; end: string }> {
    const defaults = {
      start: this.config.get('COMMS_QUIET_HOURS_START') ?? '21:00',
      end: this.config.get('COMMS_QUIET_HOURS_END') ?? '07:00',
    };

    try {
      const rows = await this.db.asTenant(tenantId, (tx) =>
        tx
          .select({ key: tenantSettings.key, value: tenantSettings.value })
          .from(tenantSettings)
          .where(eq(tenantSettings.tenantId, tenantId)),
      );
      const map = new Map(rows.map((r) => [r.key, r.value]));
      return {
        start: String(map.get('comms.quiet_hours_start') ?? defaults.start),
        end: String(map.get('comms.quiet_hours_end') ?? defaults.end),
      };
    } catch (err) {
      // Falling back to the platform default window is safe, but doing it
      // silently means a school that set its own quiet hours would have
      // messages go out at the wrong time of night with nothing to explain why.
      this.logger.error(
        `Could not read quiet hours for tenant=${tenantId}; using the platform default ` +
          `${defaults.start}-${defaults.end}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
      return defaults;
    }
  }

  private async smsUsedToday(
    tx: Parameters<Parameters<TenantDbService['asTenant']>[1]>[0],
    tenantId: string,
  ): Promise<number> {
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(deliveryAttempts)
      .where(
        and(
          eq(deliveryAttempts.tenantId, tenantId),
          eq(deliveryAttempts.channel, 'sms'),
          sql`${deliveryAttempts.createdAt}::date = current_date`,
        ),
      );
    return Number(row?.count ?? 0);
  }

  /** Dev/test helper — render a template body with variables. */
  preview(body: string, variables: Record<string, string>): string {
    return renderTemplate(body, variables);
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}

export const __testing = { chunkByRecipient };

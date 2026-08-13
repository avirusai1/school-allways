/**
 * Thin BullMQ wrapper. Queues are created lazily; if Redis is unavailable the
 * enqueue is best-effort logged so a mark request never fails because SMS is
 * down. Absentee alerts are after-commit fan-out, not part of the write path.
 */

import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';

import { REDIS_CLIENT } from '../../common/redis/redis.constants';

export const ATTENDANCE_ALERTS_QUEUE = 'attendance-alerts';
export const ATTENDANCE_SUMMARY_QUEUE = 'attendance-summary';

@Injectable()
export class AttendanceQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(AttendanceQueueService.name);
  private alertsQueue: Queue | null = null;
  private summaryQueue: Queue | null = null;

  constructor(
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  private getAlertsQueue(): Queue {
    if (!this.alertsQueue) {
      this.alertsQueue = new Queue(ATTENDANCE_ALERTS_QUEUE, {
        connection: this.redis.duplicate({ maxRetriesPerRequest: null }),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: 100,
          removeOnFail: 200,
        },
      });
    }
    return this.alertsQueue;
  }

  async enqueueAbsenteeAlerts(payload: {
    tenantId: string;
    registerId: string;
    day: string;
    studentIds: string[];
  }): Promise<number> {
    if (payload.studentIds.length === 0) return 0;
    try {
      // Deterministic job id => one alert batch per register per day, even if
      // the client replays the mutation.
      await this.getAlertsQueue().add(
        'notify-absentees',
        payload,
        { jobId: `absent-${payload.registerId}-${payload.day}` },
      );
      return payload.studentIds.length;
    } catch (err) {
      this.logger.error(
        `Failed to enqueue absentee alerts for register=${payload.registerId}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
      return 0;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.alertsQueue?.close(), this.summaryQueue?.close()]);
  }
}

/**
 * Platform invoice PDF queue. Deterministic job ids prevent duplicate renders.
 *
 * Unlike FeesQueueService, there is no inline-generation fallback when Redis
 * is down. That fallback is exactly the filesystem I/O this queue exists to
 * keep off the invoice-issue transaction (and off the request). See the
 * enqueue call site in InvoiceService.generate().
 */

import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';

import { REDIS_CLIENT } from '../../common/redis/redis.constants';

export const PLATFORM_INVOICE_PDF_QUEUE = 'platform-invoice-pdf';

export interface PlatformInvoicePdfJob {
  invoiceId: string;
  tenantId: string;
}

@Injectable()
export class SubscriptionsQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(SubscriptionsQueueService.name);
  private queue: Queue | null = null;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private getQueue(): Queue {
    if (!this.queue) {
      this.queue = new Queue(PLATFORM_INVOICE_PDF_QUEUE, {
        connection: this.redis.duplicate({ maxRetriesPerRequest: null }),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: 50,
          removeOnFail: 100,
        },
      });
    }
    return this.queue;
  }

  jobId(invoiceId: string): string {
    return `pinv-pdf-${invoiceId}`;
  }

  async enqueue(job: PlatformInvoicePdfJob): Promise<{ jobId: string; queued: boolean }> {
    const jobId = this.jobId(job.invoiceId);
    try {
      await this.getQueue().add('generate', job, { jobId });
      return { jobId, queued: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/already exists/i.test(msg)) {
        return { jobId, queued: true };
      }
      this.logger.error(`Failed to enqueue platform invoice PDF job ${jobId}: ${msg}`);
      return { jobId, queued: false };
    }
  }

  /**
   * Recovery path for a Redis outage at issue time, or a terminal render
   * failure. Drops a completed/failed job so the same deterministic id can
   * be reused; leaves an in-flight job alone.
   */
  async reenqueue(job: PlatformInvoicePdfJob): Promise<{ jobId: string; queued: boolean }> {
    const jobId = this.jobId(job.invoiceId);
    try {
      const existing = await this.getQueue().getJob(jobId);
      if (existing) {
        const state = await existing.getState();
        if (state === 'completed' || state === 'failed') {
          await existing.remove();
        } else if (
          state === 'active' ||
          state === 'waiting' ||
          state === 'delayed' ||
          state === 'prioritized' ||
          state === 'waiting-children'
        ) {
          return { jobId, queued: true };
        }
      }
      await this.getQueue().add('generate', job, { jobId });
      return { jobId, queued: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/already exists/i.test(msg)) {
        return { jobId, queued: true };
      }
      this.logger.error(`Failed to re-enqueue platform invoice PDF job ${jobId}: ${msg}`);
      return { jobId, queued: false };
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}

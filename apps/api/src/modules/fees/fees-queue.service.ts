/**
 * Invoice generation queue. Deterministic job ids prevent duplicate runs.
 * If Redis is down, FeesService falls back to inline generation so the
 * accountant is not blocked.
 */

import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';

import { REDIS_CLIENT } from '../../common/redis/redis.constants';

export const FEES_INVOICE_QUEUE = 'fees-invoice-generate';

export interface InvoiceGenerateJob {
  tenantId: string;
  branchId: string;
  userId: string | null;
  academicSessionId: string;
  termId: string;
  classId: string;
  issueDate: string;
}

@Injectable()
export class FeesQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(FeesQueueService.name);
  private queue: Queue | null = null;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private getQueue(): Queue {
    if (!this.queue) {
      this.queue = new Queue(FEES_INVOICE_QUEUE, {
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

  jobId(sessionId: string, termId: string, classId: string): string {
    return `inv-${sessionId}-${termId}-${classId}`;
  }

  async enqueue(job: InvoiceGenerateJob): Promise<{ jobId: string; queued: boolean }> {
    const jobId = this.jobId(job.academicSessionId, job.termId, job.classId);
    try {
      await this.getQueue().add('generate', job, { jobId });
      return { jobId, queued: true };
    } catch (err) {
      this.logger.error(
        `Failed to enqueue invoice job ${jobId}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
      return { jobId, queued: false };
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}

import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';

import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import type { ImportCommitJob } from './import.types';

export const IMPORT_COMMIT_QUEUE = 'import-commit';

@Injectable()
export class ImportQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(ImportQueueService.name);
  private queue: Queue | null = null;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private getQueue(): Queue {
    if (!this.queue) {
      this.queue = new Queue(IMPORT_COMMIT_QUEUE, {
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

  jobId(importId: string): string {
    // No colon: BullMQ rejects custom ids containing one, and a rejected id
    // silently drops the commit back onto the request thread.
    return `import-commit-${importId}`;
  }

  async enqueueCommit(job: ImportCommitJob): Promise<{ jobId: string; queued: boolean }> {
    const jobId = this.jobId(job.importId);
    try {
      await this.getQueue().add('commit', job, { jobId });
      return { jobId, queued: true };
    } catch (err) {
      this.logger.error(
        `Failed to enqueue import commit ${jobId}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
      return { jobId, queued: false };
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}

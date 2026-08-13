import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';

import { REDIS_CLIENT } from '../../common/redis/redis.constants';

export const EXAMS_RESULTS_QUEUE = 'exams-process-results';
export const EXAMS_REPORT_CARDS_QUEUE = 'exams-report-cards';

export interface ProcessResultsJob {
  tenantId: string;
  branchId: string;
  examId: string;
  userId: string | null;
  sectionIds?: string[];
}

export interface ReportCardChunkJob {
  tenantId: string;
  branchId: string;
  examId: string;
  templateId: string | null;
  studentIds: string[];
  chunkIndex: number;
  userId: string | null;
}

@Injectable()
export class ExamsQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(ExamsQueueService.name);
  private resultsQueue: Queue | null = null;
  private reportQueue: Queue | null = null;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private getResultsQueue(): Queue {
    if (!this.resultsQueue) {
      this.resultsQueue = new Queue(EXAMS_RESULTS_QUEUE, {
        connection: this.redis.duplicate({ maxRetriesPerRequest: null }),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: 50,
          removeOnFail: 100,
        },
      });
    }
    return this.resultsQueue;
  }

  private getReportQueue(): Queue {
    if (!this.reportQueue) {
      this.reportQueue = new Queue(EXAMS_REPORT_CARDS_QUEUE, {
        connection: this.redis.duplicate({ maxRetriesPerRequest: null }),
        defaultJobOptions: {
          attempts: 2,
          backoff: { type: 'exponential', delay: 10_000 },
          removeOnComplete: 50,
          removeOnFail: 100,
        },
      });
    }
    return this.reportQueue;
  }

  async enqueueProcessResults(
    job: ProcessResultsJob,
  ): Promise<{ jobId: string; queued: boolean }> {
    const jobId = `results-${job.examId}`;
    try {
      await this.getResultsQueue().add('process', job, { jobId });
      return { jobId, queued: true };
    } catch (err) {
      this.logger.error(
        `Failed to enqueue results job ${jobId}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
      return { jobId, queued: false };
    }
  }

  async enqueueReportCardChunks(jobs: ReportCardChunkJob[]): Promise<string[]> {
    const ids: string[] = [];
    for (const job of jobs) {
      const jobId = `rc-${job.examId}-${job.chunkIndex}`;
      ids.push(jobId);
      try {
        await this.getReportQueue().add('generate-chunk', job, { jobId });
      } catch (err) {
        this.logger.error(
          `Failed to enqueue report card chunk ${jobId}: ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }
    return ids;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.resultsQueue?.close(), this.reportQueue?.close()]);
  }
}

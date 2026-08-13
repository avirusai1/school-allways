import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';

import { REDIS_CLIENT } from '../../../common/redis/redis.constants';
import {
  EXAMS_REPORT_CARDS_QUEUE,
  EXAMS_RESULTS_QUEUE,
  type ProcessResultsJob,
  type ReportCardChunkJob,
} from '../exams-queue.service';
import { ExamsService } from '../exams.service';

@Injectable()
export class ExamsWorkersProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExamsWorkersProcessor.name);
  private resultsWorker: Worker | null = null;
  private reportWorker: Worker | null = null;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly exams: ExamsService,
  ) {}

  onModuleInit(): void {
    try {
      this.resultsWorker = new Worker<ProcessResultsJob>(
        EXAMS_RESULTS_QUEUE,
        async (job: Job<ProcessResultsJob>) => {
          const result = await this.exams.processResultsForExam(job.data);
          this.logger.log(
            `Results job ${job.id}: students=${result.students}`,
          );
          return result;
        },
        {
          connection: this.redis.duplicate({ maxRetriesPerRequest: null }),
          concurrency: 1,
        },
      );

      // Parallelism 2 — keeps PDF/memory under the 2 GB container ceiling.
      this.reportWorker = new Worker<ReportCardChunkJob>(
        EXAMS_REPORT_CARDS_QUEUE,
        async (job: Job<ReportCardChunkJob>) => {
          const result = await this.exams.generateReportCardChunk(job.data);
          this.logger.log(
            `Report card chunk ${job.id}: generated=${result.generated}`,
          );
          return result;
        },
        {
          connection: this.redis.duplicate({ maxRetriesPerRequest: null }),
          concurrency: 2,
        },
      );
    } catch (err) {
      this.logger.warn(
        `Exams workers not started: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.resultsWorker?.close(), this.reportWorker?.close()]);
  }
}

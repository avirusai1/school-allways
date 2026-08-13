/**
 * Processes invoice generation jobs. Instantiates a Worker lazily on module
 * init; if Redis is unavailable the service still generates inline on enqueue
 * failure, so this processor is best-effort.
 */

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
  FEES_INVOICE_QUEUE,
  type InvoiceGenerateJob,
} from '../fees-queue.service';
import { FeesService } from '../fees.service';

@Injectable()
export class InvoiceGenerateProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InvoiceGenerateProcessor.name);
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly fees: FeesService,
  ) {}

  onModuleInit(): void {
    try {
      this.worker = new Worker<InvoiceGenerateJob>(
        FEES_INVOICE_QUEUE,
        async (job: Job<InvoiceGenerateJob>) => {
          const result = await this.fees.generateForClass(job.data);
          this.logger.log(
            `Invoice job ${job.id}: created=${result.created} skipped=${result.skipped}`,
          );
          return result;
        },
        {
          connection: this.redis.duplicate({ maxRetriesPerRequest: null }),
          concurrency: 1,
        },
      );
      this.worker.on('failed', (job, err) => {
        this.logger.error(`Invoice job ${job?.id} failed: ${err.message}`);
      });
    } catch (err) {
      this.logger.warn(
        `Invoice worker not started: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}

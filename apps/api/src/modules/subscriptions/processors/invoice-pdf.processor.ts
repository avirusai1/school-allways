/**
 * Renders a platform B2B invoice PDF after the issue transaction has committed.
 * Instantiates a Worker lazily on module init; Redis unavailability is logged,
 * not thrown — the invoice is already legally numbered.
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
  PLATFORM_INVOICE_PDF_QUEUE,
  type PlatformInvoicePdfJob,
} from '../subscriptions-queue.service';
import { InvoiceService } from '../invoice.service';

@Injectable()
export class InvoicePdfProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InvoicePdfProcessor.name);
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly invoices: InvoiceService,
  ) {}

  onModuleInit(): void {
    try {
      this.worker = new Worker<PlatformInvoicePdfJob>(
        PLATFORM_INVOICE_PDF_QUEUE,
        async (job: Job<PlatformInvoicePdfJob>) => {
          await this.invoices.renderQueuedPdf(job.data.invoiceId, job.data.tenantId);
          this.logger.log(`Platform invoice PDF ready for ${job.data.invoiceId}`);
        },
        {
          connection: this.redis.duplicate({ maxRetriesPerRequest: null }),
          concurrency: 1,
        },
      );
      this.worker.on('failed', (job, err) => {
        this.logger.error(
          `Platform invoice PDF job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`,
        );
        const attempts = job?.opts.attempts ?? 3;
        if (job && job.attemptsMade >= attempts) {
          const data = job.data;
          void this.invoices.markPdfFailed(data.invoiceId, data.tenantId);
        }
      });
    } catch (err) {
      this.logger.warn(
        `Platform invoice PDF worker not started: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}

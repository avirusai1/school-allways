import { Module } from '@nestjs/common';

import { FeesController } from './fees.controller';
import { FeesQueueService } from './fees-queue.service';
import { FeesService } from './fees.service';
import { InvoiceGenerateProcessor } from './processors/invoice-generate.processor';

@Module({
  controllers: [FeesController],
  providers: [FeesService, FeesQueueService, InvoiceGenerateProcessor],
  exports: [FeesService],
})
export class FeesModule {}

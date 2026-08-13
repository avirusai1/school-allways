import { Module } from '@nestjs/common';

import { InvoiceService } from './invoice.service';
import { InvoicePdfProcessor } from './processors/invoice-pdf.processor';
import { StayConnectedFeeService } from './stay-connected.service';
import { SubscriptionService } from './subscription.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsQueueService } from './subscriptions-queue.service';

@Module({
  controllers: [SubscriptionsController],
  providers: [
    SubscriptionService,
    StayConnectedFeeService,
    InvoiceService,
    SubscriptionsQueueService,
    InvoicePdfProcessor,
  ],
  exports: [SubscriptionService, StayConnectedFeeService, InvoiceService],
})
export class SubscriptionsModule {}

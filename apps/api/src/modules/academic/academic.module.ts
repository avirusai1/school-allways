import { Module } from '@nestjs/common';

import { AcademicController } from './academic.controller';
import { AcademicRepository } from './academic.repository';
import { AcademicService } from './academic.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [SubscriptionsModule],
  controllers: [AcademicController],
  providers: [AcademicRepository, AcademicService],
  exports: [AcademicService],
})
export class AcademicModule {}

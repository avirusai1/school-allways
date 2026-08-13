import { Module } from '@nestjs/common';

import { ExamsController } from './exams.controller';
import { ExamsQueueService } from './exams-queue.service';
import { ExamsService } from './exams.service';
import { ExamsWorkersProcessor } from './processors/exams-workers.processor';

@Module({
  controllers: [ExamsController],
  providers: [ExamsService, ExamsQueueService, ExamsWorkersProcessor],
  exports: [ExamsService],
})
export class ExamsModule {}

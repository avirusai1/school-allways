import { Module } from '@nestjs/common';

import { ImportController } from './import.controller';
import { ImportQueueService } from './import-queue.service';
import { ImportRepository } from './import.repository';
import { ImportService } from './import.service';
import { ImportCommitService } from './processors/import-commit.processor';

@Module({
  controllers: [ImportController],
  providers: [
    ImportService,
    ImportRepository,
    ImportQueueService,
    ImportCommitService,
  ],
  exports: [ImportService],
})
export class ImportModule {}

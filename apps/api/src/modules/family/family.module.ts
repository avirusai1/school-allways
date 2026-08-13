import { Module } from '@nestjs/common';

import { BooksModule } from '../books/books.module';
import { ExamsModule } from '../exams/exams.module';
import { FeesModule } from '../fees/fees.module';
import { TransportModule } from '../transport/transport.module';
import { FamilyController } from './family.controller';
import { FamilyService } from './family.service';

@Module({
  imports: [FeesModule, ExamsModule, BooksModule, TransportModule],
  controllers: [FamilyController],
  providers: [FamilyService],
  exports: [FamilyService],
})
export class FamilyModule {}

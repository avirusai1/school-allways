import { Module } from '@nestjs/common';

import { OnboardingModule } from '../onboarding/onboarding.module';
import { GuardiansController } from './guardians.controller';
import { StudentsController } from './students.controller';
import { StudentsRepository } from './students.repository';
import { StudentsService } from './students.service';

@Module({
  imports: [OnboardingModule],
  controllers: [StudentsController, GuardiansController],
  providers: [StudentsRepository, StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}

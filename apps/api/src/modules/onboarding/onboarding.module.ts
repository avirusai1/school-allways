import { Module } from '@nestjs/common';

import { StorageModule } from '../../common/storage/storage.module';
import { AuthModule } from '../auth/auth.module';
import { GrowthModule } from '../growth/growth.module';
import { OnboardingNudgeProcessor } from './onboarding-nudge.processor';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { SignupService } from './signup.service';

@Module({
  imports: [AuthModule, GrowthModule, StorageModule],
  controllers: [OnboardingController],
  providers: [SignupService, OnboardingService, OnboardingNudgeProcessor],
  exports: [OnboardingService, OnboardingNudgeProcessor],
})
export class OnboardingModule {}

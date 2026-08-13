import { Module } from '@nestjs/common';

import { FeatureFlagsService } from './feature-flags.service';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { RollupProcessor } from './processors/rollup.processor';
import { RollupService } from './rollup.service';
import { TenantAuditController } from './tenant-audit.controller';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [SubscriptionsModule],
  controllers: [PlatformController, TenantAuditController],
  providers: [
    PlatformService,
    FeatureFlagsService,
    RollupService,
    RollupProcessor,
  ],
  exports: [FeatureFlagsService, PlatformService, RollupService],
})
export class PlatformModule {}

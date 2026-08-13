import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import type { GrantedPermission } from '../../common/context/request-context';
import { Grant, RequirePermission } from '../../common/rbac/permission.decorator';
import { ListSubscriptionsQuery, ManualActivateDto } from './dto/subscriptions.dto';
import { StayConnectedFeeService } from './stay-connected.service';
import { SubscriptionService } from './subscription.service';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptions: SubscriptionService,
    private readonly stayConnected: StayConnectedFeeService,
  ) {}

  @Get()
  @RequirePermission('subscription.student.read')
  list(
    @Query() query: ListSubscriptionsQuery,
    @Grant('subscription.student.read') grant: GrantedPermission,
  ) {
    return this.subscriptions.list(query, grant);
  }

  @Post('manual-activate')
  @RequirePermission('subscription.manual.activate')
  manualActivate(
    @Body() dto: ManualActivateDto,
    @Grant('subscription.manual.activate') grant: GrantedPermission,
  ) {
    return this.subscriptions.manualActivate(dto, grant);
  }

  /**
   * Stay Connected Fee + grace window for the school-admin banner.
   * Visible only to tenant.settings.manage (admin/principal). Does not block.
   */
  @Get('stay-connected')
  @RequirePermission('tenant.settings.manage')
  stayConnectedStatus() {
    return this.stayConnected.currentForTenant();
  }
}

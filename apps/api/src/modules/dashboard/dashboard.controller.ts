import { Controller, Get, Query } from '@nestjs/common';

import { RequirePermission } from '../../common/rbac/permission.decorator';
import { DashboardService } from './dashboard.service';
import { PrincipalDashboardQuery } from './dto/dashboard.query';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  /**
   * No @Grant: `dashboard.principal.read` is legal at tenant or branch only
   * (db/seeds/permissions.ts), and every figure here is a branch aggregate. A
   * section-scoped user cannot hold this permission at all.
   */
  @Get('principal')
  @RequirePermission('dashboard.principal.read')
  principal(@Query() query: PrincipalDashboardQuery) {
    return this.service.principal(query.day, query.branchId);
  }
}

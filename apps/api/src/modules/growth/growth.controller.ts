import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { RequirePermission } from '../../common/rbac/permission.decorator';
import {
  CreateReferralDto,
  ExportDto,
  NpsRespondDto,
} from './dto/growth.dto';
import { GrowthService } from './growth.service';

@Controller()
export class GrowthController {
  constructor(private readonly growth: GrowthService) {}

  @Post('growth/referrals')
  @RequirePermission('tenant.settings.manage')
  createReferral(@Body() dto: CreateReferralDto) {
    return this.growth.createReferral(dto);
  }

  @Get('growth/referrals/mine')
  @RequirePermission('tenant.settings.read')
  myReferrals() {
    return this.growth.myReferrals();
  }

  @Post('tenant/export')
  @RequirePermission('tenant.settings.manage')
  export(@Body() dto: ExportDto) {
    return this.growth.requestExport(dto.academicSessionId);
  }

  @Get('growth/monthly-report/:month')
  @RequirePermission('tenant.settings.read')
  monthlyReport(@Param('month') month: string) {
    return this.growth.monthlyReport(month);
  }

  @Post('growth/nps/respond')
  @RequirePermission('tenant.settings.read')
  nps(@Body() dto: NpsRespondDto) {
    return this.growth.npsRespond(dto);
  }
}

import { Body, Controller, Get, Post } from '@nestjs/common';

import type { GrantedPermission } from '../../common/context/request-context';
import { Grant, RequirePermission } from '../../common/rbac/permission.decorator';
import { ApprovalsService } from './approvals.service';
import { DecideDto } from './dto/approvals.dto';

/**
 * One decide endpoint per approval type rather than a single polymorphic one:
 * the permission required depends entirely on what is being approved, and a
 * guard cannot read that out of a request body it has not validated yet.
 */
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly service: ApprovalsService) {}

  @Get()
  @RequirePermission('approval.inbox.read')
  inbox() {
    return this.service.inbox();
  }

  @Post('leave/decide')
  @RequirePermission('leave.request.approve')
  decideLeave(
    @Body() dto: DecideDto,
    @Grant('leave.request.approve') grant: GrantedPermission,
  ) {
    return this.service.decideLeave(dto, grant);
  }

  @Post('concessions/decide')
  @RequirePermission('fee.concession.approve')
  decideConcessions(
    @Body() dto: DecideDto,
    @Grant('fee.concession.approve') grant: GrantedPermission,
  ) {
    return this.service.decideConcessions(dto, grant);
  }

  @Post('circulars/decide')
  @RequirePermission('comms.announcement.approve')
  decideCirculars(@Body() dto: DecideDto) {
    return this.service.decideCirculars(dto);
  }
}

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import type { GrantedPermission } from '../../common/context/request-context';
import { Grant, RequirePermission } from '../../common/rbac/permission.decorator';
import {
  AmendStaffAttendanceDto,
  MarkStaffAttendanceDto,
  StaffRosterQuery,
  StaffSummaryQuery,
} from './dto/staff-attendance.dto';
import { StaffAttendanceService } from './staff-attendance.service';

/**
 * Structurally simpler than the student register: no register header, no
 * per-period rows, no absentee fan-out. One flat row per person per day.
 *
 * `X-Client-Mutation-Id` is honoured by the global IdempotencyInterceptor, so
 * a replayed save returns the first response rather than clobbering a
 * correction someone made in between.
 */
@Controller('attendance/staff')
export class StaffAttendanceController {
  constructor(private readonly service: StaffAttendanceService) {}

  @Get('roster')
  @RequirePermission('attendance.staff.read')
  roster(
    @Query() query: StaffRosterQuery,
    @Grant('attendance.staff.read') grant: GrantedPermission,
  ) {
    return this.service.roster(query.day, query.branchId, grant);
  }

  @Post('mark')
  @RequirePermission('attendance.staff.mark')
  @HttpCode(HttpStatus.CREATED)
  mark(
    @Body() dto: MarkStaffAttendanceDto,
    @Grant('attendance.staff.mark') grant: GrantedPermission,
  ) {
    return this.service.mark(dto, grant);
  }

  @Patch(':staffId/day/:day')
  @RequirePermission('attendance.staff.mark')
  amend(
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @Param('day') day: string,
    @Body() dto: AmendStaffAttendanceDto,
    @Grant('attendance.staff.mark') grant: GrantedPermission,
  ) {
    return this.service.amend(staffId, day, dto, grant);
  }

  @Get('summary')
  @RequirePermission('attendance.staff.read')
  summary(
    @Query() query: StaffSummaryQuery,
    @Grant('attendance.staff.read') grant: GrantedPermission,
  ) {
    return this.service.summary(query.staffId, query.month, grant);
  }
}

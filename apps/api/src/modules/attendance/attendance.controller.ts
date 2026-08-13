import {
  Body,
  Controller,
  Get,
  Headers,
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
import { AttendanceService } from './attendance.service';
import {
  AttendanceReportQuery,
  PendingQuery,
  RosterQuery,
  StudentCalendarQuery,
  SummaryQuery,
} from './dto/list-registers.query';
import { AmendAttendanceDto, MarkAttendanceDto } from './dto/mark-attendance.dto';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  @Get('roster')
  @RequirePermission('attendance.student.mark')
  roster(
    @Query() query: RosterQuery,
    @Grant('attendance.student.mark') grant: GrantedPermission,
  ) {
    return this.service.getRoster(
      query.sectionId,
      query.day,
      query.periodId ?? null,
      grant,
    );
  }

  @Post('registers')
  @RequirePermission('attendance.student.mark')
  @HttpCode(HttpStatus.CREATED)
  mark(
    @Body() dto: MarkAttendanceDto,
    @Grant('attendance.student.mark') grant: GrantedPermission,
    @Headers('x-client-mutation-id') mutationId?: string,
  ) {
    return this.service.mark(dto, grant, mutationId);
  }

  @Patch('registers/:id')
  @RequirePermission('attendance.student.amend')
  amend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AmendAttendanceDto,
    @Grant('attendance.student.amend') grant: GrantedPermission,
  ) {
    return this.service.amend(id, dto, grant);
  }

  @Get('pending')
  @RequirePermission('attendance.student.read')
  pending(@Query() query: PendingQuery) {
    return this.service.pending(query.day, query.branchId);
  }

  @Get('summary')
  @RequirePermission('attendance.student.read')
  summary(
    @Query() query: SummaryQuery,
    @Grant('attendance.student.read') grant: GrantedPermission,
  ) {
    return this.service.summary(
      query.studentId,
      query.academicSessionId,
      query.termId,
      grant,
    );
  }

  @Get('student/:id/calendar')
  @RequirePermission('attendance.student.read')
  studentCalendar(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: StudentCalendarQuery,
    @Grant('attendance.student.read') grant: GrantedPermission,
  ) {
    return this.service.studentCalendar(id, query.month, grant);
  }

  @Get('report')
  @RequirePermission('attendance.student.read')
  report(@Query() query: AttendanceReportQuery) {
    // XLSX export is queued in a later pass; JSON matrix reads the same path.
    return { jobId: null, status: 'not_implemented', format: query.format };
  }
}

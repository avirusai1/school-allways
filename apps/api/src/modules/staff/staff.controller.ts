import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

import type { GrantedPermission } from '../../common/context/request-context';
import { Grant, RequirePermission } from '../../common/rbac/permission.decorator';
import { BulkIssueAccountsDto } from '../../common/dto/bulk-issue.dto';
import { toCsv } from '../../common/util/csv.util';
import {
  AssignSectionDto,
  AssignSubjectDto,
  CreateStaffDto,
  IssueStaffAccountDto,
  ListPendingStaffQuery,
  ListStaffQuery,
} from './dto/staff.dto';
import { StaffService } from './staff.service';

@Controller('staff')
export class StaffController {
  constructor(private readonly service: StaffService) {}

  @Get()
  @RequirePermission('staff.record.read')
  list(@Query() query: ListStaffQuery) {
    return this.service.list(query);
  }

  @Get('pending-accounts')
  @RequirePermission('staff.account.issue')
  listPending(@Query() query: ListPendingStaffQuery) {
    return this.service.listPendingStaffAccounts(query);
  }

  @Get(':id')
  @RequirePermission('staff.record.read')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Grant('staff.record.read') grant: GrantedPermission,
  ) {
    return this.service.findOne(id, grant);
  }

  @Post()
  @RequirePermission('staff.record.manage')
  create(@Body() dto: CreateStaffDto) {
    return this.service.create(dto);
  }

  @Post('account/bulk-issue')
  @RequirePermission('staff.account.issue')
  async bulkIssueAccounts(
    @Body() dto: BulkIssueAccountsDto,
    @Query('format') format: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.bulkIssueAccounts(dto);
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="staff-credentials.csv"',
      );
      return toCsv(
        ['Name', 'Phone', 'Temporary password'],
        result.issued.map((a) => [a.fullName, a.phone, a.temporaryPassword]),
      );
    }
    return result;
  }

  @Post(':id/account')
  @RequirePermission('staff.account.issue')
  issueAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IssueStaffAccountDto,
  ) {
    return this.service.issueAccount(id, dto);
  }

  @Post(':id/assignments/sections')
  @RequirePermission('staff.record.manage')
  assignSection(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignSectionDto,
  ) {
    return this.service.assignSection(id, dto);
  }

  @Post(':id/assignments/subjects')
  @RequirePermission('staff.record.manage')
  assignSubject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignSubjectDto,
  ) {
    return this.service.assignSubject(id, dto);
  }
}

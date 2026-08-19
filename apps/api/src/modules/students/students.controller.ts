import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';

import type { GrantedPermission } from '../../common/context/request-context';
import { Grant, RequirePermission } from '../../common/rbac/permission.decorator';
import { CreateStudentDto } from './dto/create-student.dto';
import { InviteStudentDto } from './dto/invite-student.dto';
import { ListStudentsQuery } from './dto/list-students.query';
import { StudentsService } from './students.service';

@Controller('students')
export class StudentsController {
  constructor(private readonly service: StudentsService) {}

  @Get()
  @RequirePermission('student.record.read')
  list(
    @Query() query: ListStudentsQuery,
    @Grant('student.record.read') grant: GrantedPermission,
  ) {
    return this.service.list(query, grant);
  }

  @Get(':id')
  @RequirePermission('student.record.read')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Grant('student.record.read') grant: GrantedPermission,
  ) {
    return this.service.findOne(id, grant);
  }

  @Post()
  @RequirePermission('student.record.manage')
  create(@Body() dto: CreateStudentDto) {
    return this.service.create(dto);
  }

  @Post(':id/invite')
  @RequirePermission('student.record.manage')
  invite(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InviteStudentDto,
    @Grant('student.record.manage') grant: GrantedPermission,
  ) {
    return this.service.inviteStudent(id, dto, grant);
  }
}

import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';

import { RequirePermission } from '../../common/rbac/permission.decorator';
import { AcademicService } from './academic.service';
import {
  ApplyTemplateDto,
  BatchSaveClassesDto,
  BatchSaveSubjectsDto,
  CreateClassDto,
  CreateSectionDto,
  CreateSessionDto,
  CreateSubjectDto,
  RolloverDto,
} from './dto/academic.dto';

@Controller('academic')
export class AcademicController {
  constructor(private readonly service: AcademicService) {}

  @Get('sessions')
  @RequirePermission('academic.session.read')
  listSessions(@Query('branchId') branchId: string) {
    return this.service.listSessions(branchId);
  }

  @Post('sessions')
  @RequirePermission('academic.session.manage')
  createSession(@Body() dto: CreateSessionDto) {
    return this.service.createSession(dto);
  }

  @Post('sessions/:id/rollover')
  @RequirePermission('academic.session.manage')
  rollover(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('dryRun', new DefaultValuePipe(false), ParseBoolPipe) dryRun: boolean,
    @Body() dto: RolloverDto,
  ) {
    return this.service.rollover(id, dto, dryRun);
  }

  @Get('classes')
  @RequirePermission('academic.master.read')
  listClasses(@Query('branchId') branchId: string) {
    return this.service.listClasses(branchId);
  }

  @Post('classes')
  @RequirePermission('academic.master.manage')
  createClass(@Body() dto: CreateClassDto) {
    return this.service.createClass(dto);
  }

  @Post('classes/batch')
  @RequirePermission('academic.master.manage')
  batchSaveClasses(@Body() dto: BatchSaveClassesDto) {
    return this.service.batchSaveClasses(dto);
  }

  @Get('sections')
  @RequirePermission('academic.master.read')
  listSections(
    @Query('branchId') branchId: string,
    @Query('academicSessionId') academicSessionId?: string,
  ) {
    return this.service.listSections(branchId, academicSessionId);
  }

  @Post('sections')
  @RequirePermission('academic.master.manage')
  createSection(@Body() dto: CreateSectionDto) {
    return this.service.createSection(dto);
  }

  @Get('subjects')
  @RequirePermission('academic.master.read')
  listSubjects(@Query('branchId') branchId: string) {
    return this.service.listSubjects(branchId);
  }

  @Get('class-subjects')
  @RequirePermission('academic.master.read')
  listClassSubjects(@Query('academicSessionId') academicSessionId: string) {
    return this.service.listClassSubjectLinks(academicSessionId);
  }

  @Post('subjects')
  @RequirePermission('academic.master.manage')
  createSubject(@Body() dto: CreateSubjectDto) {
    return this.service.createSubject(dto);
  }

  @Post('subjects/batch')
  @RequirePermission('academic.master.manage')
  batchSaveSubjects(@Body() dto: BatchSaveSubjectsDto) {
    return this.service.batchSaveSubjects(dto);
  }

  @Get('calendar')
  @RequirePermission('academic.session.read')
  listCalendar(@Query('academicSessionId') academicSessionId: string) {
    return this.service.listCalendar(academicSessionId);
  }

  @Post('templates/apply')
  @RequirePermission('academic.master.manage')
  applyTemplate(@Body() dto: ApplyTemplateDto) {
    return this.service.applyTemplate(dto);
  }
}

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import type { GrantedPermission } from '../../common/context/request-context';
import { Grant, RequirePermission } from '../../common/rbac/permission.decorator';
import {
  CreateExamDto,
  CreateHpcAssessmentDto,
  CreateHpcDomainDto,
  CreateHpcIndicatorDto,
  CreateReportCardTemplateDto,
  GenerateReportCardsDto,
  HpcStudentQuery,
  ListExamsQuery,
  MarksSheetQuery,
  MarksSheetsStatusQuery,
  ModerateMarksDto,
  PatchExamDto,
  ProcessResultsDto,
  ResultsQuery,
  SaveMarksDto,
  SeedHpcTemplateDto,
  UpsertSchedulesDto,
} from './dto/exams.dto';
import { ExamsService } from './exams.service';

@Controller()
export class ExamsController {
  constructor(private readonly service: ExamsService) {}

  // --- Exams ---

  @Get('exams')
  @RequirePermission('exam.read')
  list(@Query() query: ListExamsQuery) {
    return this.service.listExams(query.academicSessionId, query.termId);
  }

  @Post('exams')
  @RequirePermission('exam.manage')
  create(@Body() dto: CreateExamDto) {
    return this.service.createExam(dto);
  }

  @Patch('exams/:id')
  @RequirePermission('exam.manage')
  patch(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PatchExamDto) {
    return this.service.patchExam(id, dto);
  }

  @Get('exams/:id/schedules')
  @RequirePermission('exam.read')
  listSchedules(
    @Param('id', ParseUUIDPipe) id: string,
    @Grant('exam.read') grant: GrantedPermission,
  ) {
    return this.service.listSchedules(id, grant);
  }

  @Post('exams/:id/schedules')
  @RequirePermission('exam.manage')
  upsertSchedules(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertSchedulesDto,
  ) {
    return this.service.upsertSchedules(id, dto);
  }

  @Post('exams/:id/publish-timetable')
  @RequirePermission('exam.manage')
  publishTimetable(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.publishTimetable(id);
  }

  @Post('exams/:id/publish-results')
  @RequirePermission('exam.result.publish')
  publishResults(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.publishResults(id);
  }

  // --- Marks ---

  @Get('exams/:id/marks-sheets')
  @RequirePermission('exam.marks.read')
  marksSheets(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MarksSheetsStatusQuery,
    @Grant('exam.marks.read') grant: GrantedPermission,
  ) {
    return this.service.listMarksSheets(id, query.sectionId, grant);
  }

  @Get('exams/:id/marks-sheet')
  @RequirePermission('exam.marks.enter')
  marksSheet(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MarksSheetQuery,
    @Grant('exam.marks.enter') grant: GrantedPermission,
  ) {
    return this.service.getOrCreateMarksSheet(
      id,
      query.sectionId,
      query.subjectId,
      grant,
    );
  }

  @Post('exams/:id/marks')
  @RequirePermission('exam.marks.enter')
  saveMarks(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveMarksDto,
    @Grant('exam.marks.enter') grant: GrantedPermission,
    @Headers('x-client-mutation-id') clientMutationId?: string,
  ) {
    if (clientMutationId && !dto.clientMutationId) {
      dto.clientMutationId = clientMutationId;
    }
    return this.service.saveMarks(id, dto, grant);
  }

  @Post('exams/:id/marks/:sheetId/submit')
  @RequirePermission('exam.marks.enter')
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sheetId', ParseUUIDPipe) sheetId: string,
    @Grant('exam.marks.enter') grant: GrantedPermission,
  ) {
    return this.service.submitMarksSheet(id, sheetId, grant);
  }

  @Post('exams/:id/marks/:sheetId/moderate')
  @RequirePermission('exam.marks.moderate')
  moderate(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sheetId', ParseUUIDPipe) sheetId: string,
    @Body() dto: ModerateMarksDto,
  ) {
    return this.service.moderateMarksSheet(id, sheetId, dto);
  }

  @Post('exams/:id/process-results')
  @HttpCode(202)
  @RequirePermission('exam.result.publish')
  processResults(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProcessResultsDto,
  ) {
    return this.service.enqueueProcessResults(id, dto);
  }

  // --- Results ---

  @Get('results')
  @RequirePermission('exam.marks.read')
  results(
    @Query() query: ResultsQuery,
    @Grant('exam.marks.read') grant: GrantedPermission,
  ) {
    return this.service.getResults(query.studentId, grant, {
      academicSessionId: query.academicSessionId,
      examId: query.examId,
    });
  }

  // --- Report cards ---

  @Get('report-cards/templates')
  @RequirePermission('reportcard.read')
  listTemplates() {
    return this.service.listReportCardTemplates();
  }

  @Post('report-cards/templates')
  @RequirePermission('reportcard.template.manage')
  createTemplate(@Body() dto: CreateReportCardTemplateDto) {
    return this.service.createReportCardTemplate(dto);
  }

  @Post('report-cards/generate')
  @HttpCode(202)
  @RequirePermission('reportcard.manage')
  generate(@Body() dto: GenerateReportCardsDto) {
    return this.service.generateReportCards(dto);
  }

  @Get('report-cards/:studentId/:examId')
  @RequirePermission('reportcard.read')
  getReportCard(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('examId', ParseUUIDPipe) examId: string,
    @Grant('reportcard.read') grant: GrantedPermission,
  ) {
    return this.service.getReportCard(studentId, examId, grant);
  }

  // --- HPC ---

  @Get('hpc/domains')
  @RequirePermission('hpc.read')
  hpcDomains() {
    return this.service.listHpcDomains();
  }

  @Post('hpc/domains')
  @RequirePermission('hpc.assess')
  createDomain(@Body() dto: CreateHpcDomainDto) {
    return this.service.createHpcDomain(dto);
  }

  @Post('hpc/domains/seed')
  @RequirePermission('hpc.assess')
  seedHpc(@Body() dto: SeedHpcTemplateDto) {
    return this.service.seedHpcTemplate(dto);
  }

  @Get('hpc/indicators')
  @RequirePermission('hpc.read')
  hpcIndicators(@Query('domainId') domainId?: string) {
    return this.service.listHpcIndicators(domainId);
  }

  @Post('hpc/indicators')
  @RequirePermission('hpc.assess')
  createIndicator(@Body() dto: CreateHpcIndicatorDto) {
    return this.service.createHpcIndicator(dto);
  }

  @Post('hpc/assessments')
  @RequirePermission('hpc.assess')
  createAssessment(
    @Body() dto: CreateHpcAssessmentDto,
    @Grant('hpc.assess') grant: GrantedPermission,
  ) {
    return this.service.createHpcAssessment(dto, grant);
  }

  @Get('hpc/student/:id')
  @RequirePermission('hpc.read')
  hpcStudent(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: HpcStudentQuery,
    @Grant('hpc.read') grant: GrantedPermission,
  ) {
    return this.service.getHpcStudent(id, grant, {
      termId: query.termId,
      academicSessionId: query.academicSessionId,
    });
  }
}

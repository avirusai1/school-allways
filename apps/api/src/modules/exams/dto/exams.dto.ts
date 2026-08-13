import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { PaginatedQuery } from '../../../common/dto/paginated.query';

const EXAM_TYPES = [
  'unit_test',
  'periodic_test',
  'mid_term',
  'half_yearly',
  'final',
  'pre_board',
  'board',
  'practical',
  'internal_assessment',
  'project',
  'oral',
  'class_test',
] as const;

const HPC_LEVELS = ['beginner', 'progressing', 'proficient', 'advanced'] as const;
const ASSESSOR_TYPES = ['teacher', 'self', 'peer', 'parent'] as const;

export class CreateExamDto {
  @IsUUID()
  academicSessionId!: string;

  @IsOptional() @IsUUID()
  termId?: string;

  @IsString() @MinLength(1) @MaxLength(120)
  name!: string;

  @IsOptional() @IsIn([...EXAM_TYPES])
  type?: (typeof EXAM_TYPES)[number];

  @IsOptional() @IsUUID()
  gradingScaleId?: string;

  @IsOptional() @IsDateString()
  startDate?: string;

  @IsOptional() @IsDateString()
  endDate?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10_000)
  weightageBp?: number;

  @IsOptional() @IsArray() @IsUUID('4', { each: true })
  classIds?: string[];
}

export class PatchExamDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120)
  name?: string;

  @IsOptional() @IsIn([...EXAM_TYPES])
  type?: (typeof EXAM_TYPES)[number];

  @IsOptional() @IsUUID()
  gradingScaleId?: string;

  @IsOptional() @IsDateString()
  startDate?: string;

  @IsOptional() @IsDateString()
  endDate?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10_000)
  weightageBp?: number;

  @IsOptional() @IsArray() @IsUUID('4', { each: true })
  classIds?: string[];
}

export class ListExamsQuery extends PaginatedQuery {
  @IsOptional() @IsUUID()
  academicSessionId?: string;

  @IsOptional() @IsUUID()
  termId?: string;
}

export class ExamScheduleItemDto {
  @IsUUID()
  classId!: string;

  @IsUUID()
  subjectId!: string;

  @IsDateString()
  examDate!: string;

  @IsOptional() @IsString() @MaxLength(8)
  startTime?: string;

  @IsOptional() @IsString() @MaxLength(8)
  endTime?: string;

  @Type(() => Number) @IsInt() @Min(1)
  maxMarks!: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  theoryMaxMarks?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  practicalMaxMarks?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  passMarks?: number;

  @IsOptional() @IsString() @MaxLength(40)
  roomNo?: string;

  @IsOptional() @IsUUID()
  invigilatorStaffId?: string;

  @IsOptional() @IsString()
  syllabusNote?: string;
}

export class UpsertSchedulesDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ExamScheduleItemDto)
  schedules!: ExamScheduleItemDto[];
}

export class MarksSheetQuery {
  @IsUUID()
  sectionId!: string;

  @IsUUID()
  subjectId!: string;
}

export class MarksSheetsStatusQuery {
  @IsUUID()
  sectionId!: string;
}

export class MarkEntryDto {
  @IsUUID()
  studentId!: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  theoryMarks?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  practicalMarks?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  internalMarks?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  marksObtained?: number;

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  isAbsent?: boolean;

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  isExempted?: boolean;

  @IsOptional() @IsString() @MaxLength(300)
  remarks?: string;
}

export class SaveMarksDto {
  @IsUUID()
  marksSheetId!: string;

  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => MarkEntryDto)
  entries!: MarkEntryDto[];

  @IsOptional() @IsUUID()
  clientMutationId?: string;
}

export class ModerateMarksDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ModerateEntryDto)
  entries!: ModerateEntryDto[];

  @IsOptional() @IsString() @MaxLength(2000)
  moderationNote?: string;
}

export class ModerateEntryDto {
  @IsUUID()
  studentId!: string;

  @Type(() => Number) @IsInt() @Min(0)
  marksObtained!: number;
}

export class ProcessResultsDto {
  @IsOptional() @IsArray() @IsUUID('4', { each: true })
  sectionIds?: string[];
}

export class ResultsQuery extends PaginatedQuery {
  @IsUUID()
  studentId!: string;

  @IsOptional() @IsUUID()
  academicSessionId?: string;

  @IsOptional() @IsUUID()
  examId?: string;
}

export class CreateReportCardTemplateDto {
  @IsString() @MinLength(1) @MaxLength(120)
  name!: string;

  @IsOptional() @IsIn(['cbse_standard', 'icse', 'hpc', 'custom'])
  format?: string;

  @IsOptional() @IsArray() @IsUUID('4', { each: true })
  appliesToClassIds?: string[];

  @IsOptional()
  layout?: Record<string, unknown>;

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  isDefault?: boolean;
}

export class GenerateReportCardsDto {
  @IsUUID()
  examId!: string;

  @IsArray() @ArrayMinSize(1) @IsUUID('4', { each: true })
  sectionIds!: string[];

  @IsOptional() @IsUUID()
  templateId?: string;
}

export class CreateHpcDomainDto {
  @IsString() @MinLength(1) @MaxLength(30)
  code!: string;

  @IsString() @MinLength(1) @MaxLength(120)
  name!: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsString() @MaxLength(30)
  stage?: string;

  @IsOptional() @Type(() => Number) @IsInt()
  sequence?: number;
}

export class CreateHpcIndicatorDto {
  @IsUUID()
  domainId!: string;

  @IsString() @MinLength(1) @MaxLength(40)
  code!: string;

  @IsString() @MinLength(1)
  statement!: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  levels?: string[];

  @IsOptional() @Type(() => Number) @IsInt()
  sequence?: number;
}

export class CreateHpcAssessmentDto {
  @IsUUID()
  studentId!: string;

  @IsUUID()
  indicatorId!: string;

  @IsUUID()
  academicSessionId!: string;

  @IsOptional() @IsUUID()
  termId?: string;

  @IsIn([...ASSESSOR_TYPES])
  assessorType!: (typeof ASSESSOR_TYPES)[number];

  @IsOptional() @IsIn([...HPC_LEVELS])
  level?: (typeof HPC_LEVELS)[number];

  @IsOptional() @IsString()
  observationNote?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  evidencePaths?: string[];

  @IsOptional() @IsDateString()
  observedOn?: string;

  @IsOptional() @IsUUID()
  clientMutationId?: string;
}

export class HpcStudentQuery {
  @IsOptional() @IsUUID()
  termId?: string;

  @IsOptional() @IsUUID()
  academicSessionId?: string;
}

export class SeedHpcTemplateDto {
  @IsOptional() @IsIn(['foundational', 'preparatory', 'middle', 'secondary'])
  stage?: string;
}

import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { PaginatedQuery } from '../../../common/dto/paginated.query';

export class ListHomeworkQuery extends PaginatedQuery {
  @IsOptional() @IsUUID()
  sectionId?: string;

  @IsOptional() @IsIn(['draft', 'published', 'closed', 'cancelled'])
  status?: string;
}

export class HomeworkFeedQuery extends PaginatedQuery {
  /** Omit to load all children when the grant is self-scoped. */
  @IsOptional() @IsUUID()
  studentId?: string;
}

export class CreateHomeworkDto {
  @IsUUID()
  sectionId!: string;

  @IsOptional() @IsUUID()
  subjectId?: string;

  @IsString() @MinLength(1) @MaxLength(200)
  title!: string;

  @IsOptional() @IsString()
  description?: string;

  @IsDateString()
  assignedOn!: string;

  @IsOptional() @IsDateString()
  dueOn?: string;

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  requiresSubmission?: boolean;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  maxMarks?: number;
}

export class SubmitHomeworkDto {
  @IsOptional() @IsString()
  responseText?: string;

  @IsOptional()
  attachmentPaths?: string[];
}

export class GradeHomeworkDto {
  @Type(() => Number) @IsInt() @Min(0)
  marksObtained!: number;

  @IsOptional() @IsString()
  teacherRemarks?: string;
}

export class ListDiaryQuery {
  /**
   * Omit to load every linked child when the grant is self-scoped — same
   * pattern as HomeworkFeedQuery. A parent opening the diary is looking for
   * "what happened with my kids," not forced into a child picker first.
   */
  @IsOptional() @IsUUID()
  studentId?: string;

  @IsOptional() @IsDateString()
  from?: string;

  @IsOptional() @IsDateString()
  to?: string;
}

export class CreateDiaryDto {
  @IsOptional() @IsUUID()
  sectionId?: string;

  @IsOptional() @IsUUID()
  studentId?: string;

  @IsDateString()
  day!: string;

  @IsOptional() @IsIn(['note', 'appreciation', 'concern', 'reminder', 'observation'])
  entryType?: string;

  @IsString() @MinLength(1)
  body!: string;

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  feedsHpc?: boolean;
}

export class HomeworkStudentActionDto {
  @IsUUID()
  studentId!: string;
}

export class SubmitHomeworkBodyDto extends SubmitHomeworkDto {
  @IsUUID()
  studentId!: string;
}

export class GradeHomeworkBodyDto extends GradeHomeworkDto {
  @IsUUID()
  studentId!: string;
}

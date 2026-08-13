import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PaginatedQuery } from '../../../common/dto/paginated.query';

export class ListStaffQuery extends PaginatedQuery {
  @IsOptional() @IsUUID()
  branchId?: string;

  @IsOptional() @IsString() @MaxLength(100)
  q?: string;

  @IsOptional() @IsIn(['active', 'on_leave', 'suspended', 'resigned'])
  status?: string;

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  isTeaching?: boolean;
}

export class ListPendingStaffQuery {
  @IsOptional() @IsString() @MaxLength(100)
  q?: string;
}

export class CreateStaffDto {
  @IsUUID()
  branchId!: string;

  @IsString() @MaxLength(40)
  employeeCode!: string;

  @IsString() @MaxLength(80)
  firstName!: string;

  @IsOptional() @IsString() @MaxLength(80)
  lastName?: string;

  @IsOptional() @IsString() @MaxLength(100)
  designation?: string;

  @IsOptional() @IsString()
  workPhone?: string;

  @IsOptional() @IsString()
  workEmail?: string;

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  isTeaching?: boolean;
}

export class AssignSectionDto {
  @IsUUID()
  sectionId!: string;

  @IsUUID()
  academicSessionId!: string;

  @IsOptional() @IsIn(['class_teacher', 'assistant'])
  assignmentType?: 'class_teacher' | 'assistant';
}

export class AssignSubjectDto {
  @IsUUID()
  sectionId!: string;

  @IsUUID()
  subjectId!: string;

  @IsUUID()
  academicSessionId!: string;
}

/**
 * Front-office / HR path that bypasses invite+OTP: set email + password and
 * activate the membership immediately so the person can sign in today.
 */
export class IssueStaffAccountDto {
  /** Omit for phone-only front-desk credentials when staff has a phone on file. */
  @IsOptional() @IsEmail()
  email?: string;

  /** Omit to auto-generate; returned once in the response. */
  @IsOptional() @IsString() @MinLength(8) @MaxLength(128)
  password?: string;
}

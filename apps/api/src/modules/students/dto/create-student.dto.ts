import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateStudentDto {
  @IsUUID()
  branchId!: string;

  @IsUUID()
  academicSessionId!: string;

  @IsUUID()
  classId!: string;

  @IsOptional() @IsUUID()
  sectionId?: string;

  @IsString() @MaxLength(40)
  admissionNo!: string;

  @IsOptional() @IsDateString()
  admissionDate?: string;

  @IsString() @MaxLength(80)
  firstName!: string;

  @IsOptional() @IsString() @MaxLength(80)
  middleName?: string;

  @IsOptional() @IsString() @MaxLength(80)
  lastName?: string;

  @IsOptional() @IsDateString()
  dateOfBirth?: string;

  @IsOptional() @IsIn(['male', 'female', 'other', 'prefer_not_to_say'])
  gender?: string;

  @IsOptional() @IsString() @MaxLength(20)
  rollNo?: string;

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  isRteStudent?: boolean;

  /** Last 4 digits only — full Aadhaar is never accepted or stored. */
  @IsOptional() @Matches(/^\d{4}$/)
  aadhaarLast4?: string;

  @IsOptional() @IsString() @MaxLength(64)
  aadhaarHash?: string;
}

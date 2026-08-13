import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

const ATTENDANCE_STATUSES = [
  'present',
  'absent',
  'late',
  'half_day',
  'excused',
  'on_leave',
] as const;

export class AttendanceEntryDto {
  @IsUUID()
  studentId!: string;

  @IsIn(ATTENDANCE_STATUSES)
  status!: (typeof ATTENDANCE_STATUSES)[number];

  @IsOptional() @Matches(/^\d{2}:\d{2}$/)
  inTime?: string;

  @IsOptional() @IsUUID()
  leaveRequestId?: string;

  @IsOptional() @IsString() @MaxLength(200)
  remarks?: string;
}

export class MarkAttendanceDto {
  @IsUUID()
  sectionId!: string;

  @IsUUID()
  academicSessionId!: string;

  @IsDateString()
  day!: string;

  @IsOptional() @IsUUID()
  periodId?: string | null;

  @IsOptional() @IsUUID()
  subjectId?: string | null;

  @IsOptional() @IsIn(['daily', 'period'])
  mode: 'daily' | 'period' = 'daily';

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  entries!: AttendanceEntryDto[];

  /** Allow marking on a holiday (admin override). */
  @IsOptional() @Type(() => Boolean) @IsBoolean()
  force?: boolean;
}

export class AmendAttendanceDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  entries!: AttendanceEntryDto[];

  @IsString()
  @MinLength(10, { message: 'Please explain why you are changing this attendance (at least 10 characters).' })
  @MaxLength(500)
  reason!: string;
}

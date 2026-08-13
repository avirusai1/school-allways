import { IsDateString, IsIn, IsOptional, IsUUID, Matches } from 'class-validator';

export class RosterQuery {
  @IsUUID()
  sectionId!: string;

  @IsDateString()
  day!: string;

  @IsOptional() @IsUUID()
  periodId?: string;
}

export class PendingQuery {
  @IsDateString()
  day!: string;

  @IsOptional() @IsUUID()
  branchId?: string;
}

export class SummaryQuery {
  @IsUUID()
  studentId!: string;

  @IsUUID()
  academicSessionId!: string;

  @IsOptional() @IsUUID()
  termId?: string;
}

export class StudentCalendarQuery {
  /** YYYY-MM */
  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be YYYY-MM' })
  month!: string;
}

export class AttendanceReportQuery {
  @IsUUID()
  sectionId!: string;

  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsOptional() @IsIn(['json', 'xlsx'])
  format: 'json' | 'xlsx' = 'json';
}

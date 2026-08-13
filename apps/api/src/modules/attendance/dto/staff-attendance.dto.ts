import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * What a human may set from the register screen. The enum also carries
 * `holiday` and `not_marked`, which are states the system derives rather than
 * states a clerk chooses.
 */
export const MARKABLE_STAFF_STATUSES = [
  'present',
  'absent',
  'late',
  'half_day',
  'on_leave',
  'excused',
] as const;

export type MarkableStaffStatus = (typeof MARKABLE_STAFF_STATUSES)[number];

/** `HH:MM` or `HH:MM:SS` — the column is a bare `time`. */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export class StaffRosterQuery {
  @IsDateString()
  day!: string;

  @IsOptional() @IsUUID()
  branchId?: string;
}

export class StaffAttendanceEntryDto {
  @IsUUID()
  staffId!: string;

  @IsIn(MARKABLE_STAFF_STATUSES)
  status!: MarkableStaffStatus;

  @IsOptional() @Matches(TIME_RE, { message: 'inTime must look like 09:15.' })
  inTime?: string;

  @IsOptional() @Matches(TIME_RE, { message: 'outTime must look like 16:40.' })
  outTime?: string;

  @IsOptional() @IsString() @MaxLength(200)
  remarks?: string;
}

export class MarkStaffAttendanceDto {
  @IsUUID()
  branchId!: string;

  @IsDateString()
  day!: string;

  /**
   * The whole roster in one call. A branch with more than 500 staff is a
   * campus group that should be marking per branch anyway.
   */
  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => StaffAttendanceEntryDto)
  entries!: StaffAttendanceEntryDto[];
}

export class AmendStaffAttendanceDto {
  @IsOptional() @IsIn(MARKABLE_STAFF_STATUSES)
  status?: MarkableStaffStatus;

  @IsOptional() @Matches(TIME_RE, { message: 'inTime must look like 09:15.' })
  inTime?: string;

  @IsOptional() @Matches(TIME_RE, { message: 'outTime must look like 16:40.' })
  outTime?: string;

  @IsOptional() @IsString() @MaxLength(200)
  remarks?: string;
}

export class StaffSummaryQuery {
  @IsUUID()
  staffId!: string;

  /** `YYYY-MM`. */
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must look like 2026-08.' })
  month!: string;
}

// --- responses -------------------------------------------------------------

export class StaffRosterRowDto {
  staffId!: string;
  employeeCode!: string;
  fullName!: string;
  designation!: string | null;
  department!: string | null;
  /** `not_marked` until someone marks the day. */
  status!: string;
  inTime!: string | null;
  outTime!: string | null;
  remarks!: string | null;
  /** Set when an approved leave request covers this day. */
  onApprovedLeave!: boolean;
}

export class StaffRosterResponseDto {
  branchId!: string;
  day!: string;
  rows!: StaffRosterRowDto[];
  meta!: {
    total: number;
    marked: number;
    present: number;
    /** False when the caller may only see their own row. */
    isFullRoster: boolean;
  };
}

export class MarkStaffAttendanceResponseDto {
  day!: string;
  branchId!: string;
  total!: number;
  present!: number;
  absent!: number;
  late!: number;
  onLeave!: number;
  markedAt!: string;
}

export class StaffAttendanceSummaryDto {
  staffId!: string;
  month!: string;
  present!: number;
  absent!: number;
  late!: number;
  halfDay!: number;
  onLeave!: number;
  /** Days with a row of any decided status — the denominator worth quoting. */
  markedDays!: number;
  workedMinutes!: number;
}

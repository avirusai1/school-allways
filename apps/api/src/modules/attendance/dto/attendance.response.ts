export class RosterStudentDto {
  studentId!: string;
  rollNo!: string | null;
  fullName!: string;
  photoUrl!: string | null;
  status!: string;
  onApprovedLeave!: boolean;
  remarks!: string | null;
}

export class RosterRegisterDto {
  id!: string | null;
  sectionId!: string;
  sectionLabel!: string;
  academicSessionId!: string;
  day!: string;
  periodId!: string | null;
  mode!: string;
  isLocked!: boolean;
  markedAt!: string | null;
  markedByName!: string | null;
}

export class RosterResponseDto {
  register!: RosterRegisterDto;
  students!: RosterStudentDto[];
  meta!: { total: number; isHoliday: boolean; holidayTitle: string | null };
}

export class MarkAttendanceResponseDto {
  registerId!: string;
  day!: string;
  sectionLabel!: string;
  presentCount!: number;
  absentCount!: number;
  lateCount!: number;
  totalCount!: number;
  markedAt!: string;
  alertsQueued!: number;
}

export class PendingSectionDto {
  sectionId!: string;
  sectionLabel!: string;
  classTeacherName!: string | null;
  periodLabel!: string | null;
  expectedBy!: string;
  minutesOverdue!: number;
}

export class AttendanceSummaryDto {
  workingDays!: number;
  presentDays!: number;
  absentDays!: number;
  lateDays!: number;
  leaveDays!: number;
  percentageBp!: number;
  monthly!: Array<{
    month: string;
    workingDays: number;
    presentDays: number;
    percentageBp: number;
  }>;
}

export class CalendarDayDto {
  day!: string;
  status!: string;
}

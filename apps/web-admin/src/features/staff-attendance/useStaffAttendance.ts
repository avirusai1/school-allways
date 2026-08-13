import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '../../lib/api';

export type StaffStatus =
  | 'present'
  | 'absent'
  | 'late'
  | 'half_day'
  | 'on_leave'
  | 'excused';

export type StaffRosterRow = {
  staffId: string;
  employeeCode: string;
  fullName: string;
  designation: string | null;
  department: string | null;
  /** `not_marked` until someone marks the day. */
  status: string;
  inTime: string | null;
  outTime: string | null;
  remarks: string | null;
  onApprovedLeave: boolean;
};

export type StaffRoster = {
  branchId: string;
  day: string;
  rows: StaffRosterRow[];
  meta: {
    total: number;
    marked: number;
    present: number;
    /** False when the caller may only see their own row. */
    isFullRoster: boolean;
  };
};

export type MarkStaffResult = {
  day: string;
  branchId: string;
  total: number;
  present: number;
  absent: number;
  late: number;
  onLeave: number;
  markedAt: string;
};

export type StaffAttendanceSummary = {
  staffId: string;
  month: string;
  present: number;
  absent: number;
  late: number;
  halfDay: number;
  onLeave: number;
  markedDays: number;
  workedMinutes: number;
};

export function todayIso(): string {
  const now = new Date();
  const tz = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - tz).toISOString().slice(0, 10);
}

export function useStaffRoster(branchId: string | undefined, day: string) {
  return useQuery({
    queryKey: ['staff-attendance', 'roster', branchId, day],
    enabled: Boolean(branchId),
    queryFn: () =>
      apiFetch<StaffRoster>(
        `/attendance/staff/roster?day=${day}&branchId=${encodeURIComponent(branchId!)}`,
      ),
  });
}

export function useStaffAttendanceSummary(
  staffId: string | undefined,
  month: string,
) {
  return useQuery({
    queryKey: ['staff-attendance', 'summary', staffId, month],
    enabled: Boolean(staffId),
    queryFn: () =>
      apiFetch<StaffAttendanceSummary>(
        `/attendance/staff/summary?staffId=${encodeURIComponent(staffId!)}&month=${month}`,
      ),
  });
}

/**
 * The whole register in one request. The dashboard's "Staff present" tile
 * reads the same rows, so it is invalidated here — otherwise a head who marks
 * the register and clicks Dashboard sees yesterday's figure and distrusts both
 * screens.
 */
export function useMarkStaffAttendance() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (body: {
      branchId: string;
      day: string;
      entries: Array<{
        staffId: string;
        status: StaffStatus;
        inTime?: string;
        outTime?: string;
        remarks?: string;
      }>;
    }) =>
      apiFetch<MarkStaffResult>('/attendance/staff/mark', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['staff-attendance'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

/** Same-day correction for one person: present at nine, sent home at eleven. */
export function useAmendStaffAttendance() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({
      staffId,
      day,
      ...patch
    }: {
      staffId: string;
      day: string;
      status?: StaffStatus;
      inTime?: string;
      outTime?: string;
      remarks?: string;
    }) =>
      apiFetch(`/attendance/staff/${staffId}/day/${day}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['staff-attendance'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

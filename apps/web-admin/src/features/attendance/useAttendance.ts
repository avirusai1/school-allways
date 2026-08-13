import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';

export type MarkableStatus = 'present' | 'absent' | 'late' | 'half_day' | 'excused';

export type RosterStudent = {
  studentId: string;
  rollNo: string | null;
  fullName: string;
  photoUrl: string | null;
  /** 'not_marked' until a register exists for the day. */
  status: string;
  onApprovedLeave: boolean;
  remarks: string | null;
};

export type Roster = {
  register: {
    id: string | null;
    sectionId: string;
    sectionLabel: string;
    academicSessionId: string;
    day: string;
    periodId: string | null;
    mode: string;
    isLocked: boolean;
    markedAt: string | null;
    markedByName: string | null;
  };
  students: RosterStudent[];
  meta: { total: number; isHoliday: boolean; holidayTitle: string | null };
};

export type MarkResult = {
  registerId: string;
  day: string;
  sectionLabel: string;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  totalCount: number;
  markedAt: string;
  alertsQueued: number;
};

export function todayIso(): string {
  const now = new Date();
  const tz = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - tz).toISOString().slice(0, 10);
}

export function useRoster(sectionId: string | undefined, day: string) {
  return useQuery({
    queryKey: ['attendance', 'roster', sectionId, day],
    enabled: Boolean(sectionId),
    queryFn: () =>
      apiFetch<Roster>(
        `/attendance/roster?sectionId=${encodeURIComponent(sectionId!)}&day=${day}`,
      ),
  });
}

export function useMarkAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      sectionId: string;
      academicSessionId: string;
      day: string;
      entries: Array<{ studentId: string; status: MarkableStatus }>;
    }) =>
      apiFetch<MarkResult>('/attendance/registers', {
        method: 'POST',
        body: JSON.stringify({ ...body, mode: 'daily' }),
      }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: ['attendance', 'roster', vars.sectionId, vars.day],
      });
      // The dashboard's attendance tile and unmarked-sections banner both count
      // the register just written.
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      // Activation flips tenants.activatedAt on the first register, which the
      // onboarding state and the session both report.
      void qc.invalidateQueries({ queryKey: ['onboarding', 'state'] });
      void qc.invalidateQueries({ queryKey: ['session'] });
    },
  });
}

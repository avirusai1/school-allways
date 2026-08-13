import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '../../lib/api';

export type AttendanceToday = {
  present: number;
  total: number;
  percentageBp: number;
  markedSections: number;
  totalSections: number;
};

export type StaffToday = {
  present: number;
  total: number;
  marked: number;
};

export type CollectionPoint = {
  day: string;
  amountPaise: number;
};

export type ApprovalCounts = {
  staffLeave: number;
  studentLeave: number;
  feeConcession: number;
  circular: number;
};

export type UnmarkedSection = {
  sectionId: string;
  sectionLabel: string;
  classTeacherName: string | null;
};

export type IncidentSummary = {
  id: string;
  title: string;
  category: string;
  severity: string;
  occurredAt: string | null;
};

export type PrincipalDashboard = {
  day: string;
  academicSessionId: string | null;
  attendance: AttendanceToday;
  staff: StaffToday;
  collections: { todayPaise: number; series: CollectionPoint[] };
  openItems: { total: number; approvals: ApprovalCounts; incidents: number };
  unmarkedSections: UnmarkedSection[];
  incidents: IncidentSummary[];
};

/**
 * When today's attendance stops being good news, in basis points.
 *
 * This is policy, recorded here because it was not written down anywhere else:
 * below 85% a principal should look, below 75% something is wrong — a strike, a
 * festival nobody put in the calendar, a bus that did not run. The spec
 * (build/14 §11) colours this tile green unconditionally, which would paint a
 * 42% morning as a good one.
 *
 * A boarding school and a day school do not share a normal, so this belongs in
 * tenant settings eventually. One constant is the honest version of that until
 * someone asks for it.
 */
export const ATTENDANCE_CONCERN_BP = 8500;
export const ATTENDANCE_ALARM_BP = 7500;

export function attendanceTone(
  percentageBp: number,
): 'positive' | 'warning' | 'critical' {
  if (percentageBp < ATTENDANCE_ALARM_BP) return 'critical';
  if (percentageBp < ATTENDANCE_CONCERN_BP) return 'warning';
  return 'positive';
}

/**
 * Refetched on focus rather than polled: the numbers move when a teacher marks
 * a register, and a principal who switches back to this tab wants what is true
 * now, not a figure from whenever the tab was opened.
 */
export function usePrincipalDashboard(branchId: string | undefined) {
  return useQuery({
    queryKey: ['dashboard', 'principal', branchId],
    enabled: Boolean(branchId),
    refetchOnWindowFocus: true,
    staleTime: 60_000,
    queryFn: () =>
      apiFetch<PrincipalDashboard>(`/dashboard/principal?branchId=${branchId}`),
  });
}

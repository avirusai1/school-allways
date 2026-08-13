export class AttendanceTodayDto {
  /** Students present or late, from the registers marked so far today. */
  present!: number;
  total!: number;
  /** Basis points, so the client never rounds a percentage twice. */
  percentageBp!: number;
  markedSections!: number;
  totalSections!: number;
}

export class StaffTodayDto {
  present!: number;
  total!: number;
  /**
   * Zero means nobody has taken staff attendance today. The client must say so
   * rather than render `0 of 68`, which reads as an empty staffroom.
   */
  marked!: number;
}

export class CollectionPointDto {
  day!: string;
  amountPaise!: number;
}

export class CollectionsDto {
  todayPaise!: number;
  /** Oldest first, one point per day including days with no takings. */
  series!: CollectionPointDto[];
}

export class ApprovalCountsDto {
  staffLeave!: number;
  studentLeave!: number;
  feeConcession!: number;
  circular!: number;
}

export class OpenItemsDto {
  /** What the tile shows: everything waiting on a decision from this office. */
  total!: number;
  approvals!: ApprovalCountsDto;
  incidents!: number;
}

export class UnmarkedSectionDto {
  sectionId!: string;
  sectionLabel!: string;
  classTeacherName!: string | null;
}

export class IncidentSummaryDto {
  id!: string;
  title!: string;
  category!: string;
  severity!: string;
  occurredAt!: string | null;
}

export class PrincipalDashboardDto {
  day!: string;
  attendance!: AttendanceTodayDto;
  staff!: StaffTodayDto;
  collections!: CollectionsDto;
  openItems!: OpenItemsDto;
  /** Capped; the banner links to the full attendance view. */
  unmarkedSections!: UnmarkedSectionDto[];
  incidents!: IncidentSummaryDto[];
  /**
   * Null when the branch has no current academic session — the client shows the
   * setup empty state instead of a wall of zeroes.
   */
  academicSessionId!: string | null;
}

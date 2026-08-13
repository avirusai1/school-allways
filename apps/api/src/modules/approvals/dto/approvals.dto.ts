import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export type ApprovalType =
  | 'staff_leave'
  | 'student_leave'
  | 'fee_concession'
  | 'circular';

export class DecideDto {
  /** Bulk by default — approving a morning's leave one row at a time is the
   *  thing this screen exists to stop. */
  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(200) @IsUUID('4', { each: true })
  ids!: string[];

  @IsIn(['approve', 'reject'])
  action!: 'approve' | 'reject';

  /** Required by the service when rejecting — a bare "no" helps nobody. */
  @IsOptional() @IsString() @MaxLength(500)
  reason?: string;
}

export class ApprovalItemDto {
  id!: string;
  type!: ApprovalType;
  /** Who or what the decision is about: a person's name, or a circular title. */
  subject!: string;
  /** The second line: class-section, designation, audience. */
  detail!: string | null;
  /** Dates, percentages, or whatever the approver needs to judge it. */
  summary!: string | null;
  /** Formatted by the client so there is one money formatter, not two. */
  amountPaise?: number | null;
  reason!: string | null;
  requestedAt!: string;
}

export class ApprovalGroupDto {
  type!: ApprovalType;
  label!: string;
  count!: number;
  /**
   * True when the caller may act on this group. The list is one permission
   * (`approval.inbox.read`); acting on each type is another, so a coordinator
   * can see what is outstanding without being able to sign it off.
   */
  canDecide!: boolean;
  items!: ApprovalItemDto[];
}

export class ApprovalInboxDto {
  total!: number;
  groups!: ApprovalGroupDto[];
}

export class DecisionResultDto {
  /** Rows actually changed. Lower than `ids.length` when someone else got
   *  there first, which is normal with two people on the same inbox. */
  decided!: number;
  requested!: number;
}

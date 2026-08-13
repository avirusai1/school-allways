import { ForbiddenException, Injectable } from '@nestjs/common';
import { studentEnrollments } from '@saw/db';

import {
  RequestContextStore,
  type GrantedPermission,
} from '../../common/context/request-context';
import { TenantDbService } from '../../common/database/tenant-db.service';
import { ApiException } from '../../common/errors/api.exception';
import { scopeFilter } from '../../common/rbac/scope.util';
import { ApprovalsRepository } from './approvals.repository';
import type {
  ApprovalGroupDto,
  ApprovalInboxDto,
  DecideDto,
  DecisionResultDto,
} from './dto/approvals.dto';

/** Deep enough to clear a morning; the count above it is the true total. */
const PER_GROUP = 50;

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly db: TenantDbService,
    private readonly repo: ApprovalsRepository,
  ) {}

  async inbox(): Promise<ApprovalInboxDto> {
    const ctx = RequestContextStore.get();
    const branchId = ctx.branchId;
    if (!branchId) {
      throw new ApiException(
        400,
        'BAD_REQUEST',
        'Choose a branch before opening the approvals inbox.',
      );
    }

    // The inbox permission is branch-wide, but a user may only hold the
    // *approve* permission for their own sections. Filter the list by that
    // narrower grant where one exists, so the queue shows what they can act on.
    const leaveGrant = ctx.permissions.get('leave.request.approve');
    const concessionGrant = ctx.permissions.get('fee.concession.approve');

    const canDecideStaffLeave = this.canSeeStaffLeave(leaveGrant);

    return this.db.run(async (tx) => {
      const [staffLeave, studentLeave, concessions, circulars] = await Promise.all([
        canDecideStaffLeave
          ? this.repo.staffLeave(tx, branchId, PER_GROUP)
          : Promise.resolve([]),
        this.repo.studentLeave(
          tx,
          branchId,
          PER_GROUP,
          studentScope(leaveGrant, branchId),
        ),
        this.repo.concessions(tx, PER_GROUP, studentScope(concessionGrant, branchId)),
        this.repo.circulars(tx, PER_GROUP),
      ]);

      const groups: ApprovalGroupDto[] = [
        {
          type: 'staff_leave',
          label: 'Staff leave',
          count: staffLeave.length,
          canDecide: canDecideStaffLeave,
          items: staffLeave.map((r) => ({
            id: r.id,
            type: 'staff_leave' as const,
            subject: fullName(r.firstName, r.lastName),
            detail: r.designation,
            summary: dateRange(r.fromDate, r.toDate, r.dayCount),
            reason: r.reason,
            requestedAt: r.createdAt.toISOString(),
          })),
        },
        {
          type: 'student_leave',
          label: 'Student leave',
          count: studentLeave.length,
          canDecide: Boolean(leaveGrant),
          items: studentLeave.map((r) => ({
            id: r.id,
            type: 'student_leave' as const,
            subject: fullName(r.firstName, r.lastName),
            detail: classLabel(r.className, r.sectionName),
            summary: dateRange(r.fromDate, r.toDate, r.dayCount),
            reason: r.reason,
            requestedAt: r.createdAt.toISOString(),
          })),
        },
        {
          type: 'fee_concession',
          label: 'Fee concessions',
          count: concessions.length,
          canDecide: Boolean(concessionGrant),
          items: concessions.map((r) => ({
            id: r.id,
            type: 'fee_concession' as const,
            subject: fullName(r.firstName, r.lastName),
            detail: classLabel(r.className, r.sectionName),
            summary: concessionSummary(r.type, r.percentageBp),
            amountPaise: r.flatAmountPaise,
            reason: r.reason,
            requestedAt: r.createdAt.toISOString(),
          })),
        },
        {
          type: 'circular',
          label: 'Circulars',
          count: circulars.length,
          canDecide: Boolean(ctx.permissions.get('comms.announcement.approve')),
          items: circulars.map((r) => ({
            id: r.id,
            type: 'circular' as const,
            subject: r.title,
            detail: `To ${r.audienceType.replace(/_/g, ' ')}`,
            summary: r.scheduledFor
              ? `Scheduled ${r.scheduledFor.toISOString().slice(0, 10)}`
              : `${r.priority} priority`,
            reason: null,
            requestedAt: r.createdAt.toISOString(),
          })),
        },
      ].filter((g) => g.items.length > 0 || g.canDecide) as ApprovalGroupDto[];

      return {
        total: groups.reduce((n, g) => n + g.count, 0),
        groups,
      };
    });
  }

  async decideLeave(
    dto: DecideDto,
    grant: GrantedPermission,
  ): Promise<DecisionResultDto> {
    const ctx = RequestContextStore.get();
    const approved = requireReason(dto);

    return this.db.run(async (tx) => {
      const targets = await this.repo.leaveTargets(tx, dto.ids);
      this.assertAllFound(targets, dto.ids, 'leave request');

      for (const t of targets) {
        if (t.staffId) {
          // A section-scoped grant is "the children in my classes". It says
          // nothing about a colleague's leave, so it cannot approve one.
          if (grant.scope === 'section' || grant.scope === 'self') {
            throw new ForbiddenException(
              'Approving staff leave needs branch-wide authority.',
            );
          }
          continue;
        }
        assertRowInScope(grant, t.sectionId, t.studentId);
      }

      const decided = await this.repo.decideLeave(
        tx,
        dto.ids,
        approved,
        ctx.userId,
        dto.reason ?? null,
      );

      this.audit('leave.request', dto, approved);
      return { decided, requested: dto.ids.length };
    });
  }

  async decideConcessions(
    dto: DecideDto,
    grant: GrantedPermission,
  ): Promise<DecisionResultDto> {
    const ctx = RequestContextStore.get();
    const approved = requireReason(dto);

    return this.db.run(async (tx) => {
      const targets = await this.repo.concessionTargets(tx, dto.ids);
      this.assertAllFound(targets, dto.ids, 'concession');

      for (const t of targets) {
        assertRowInScope(grant, t.sectionId, t.studentId);
      }

      const decided = await this.repo.decideConcessions(
        tx,
        dto.ids,
        approved,
        ctx.userId,
      );

      this.audit('fee.concession', dto, approved);
      return { decided, requested: dto.ids.length };
    });
  }

  async decideCirculars(dto: DecideDto): Promise<DecisionResultDto> {
    const ctx = RequestContextStore.get();
    const approved = requireReason(dto);

    return this.db.run(async (tx) => {
      const targets = await this.repo.circularTargets(tx, dto.ids);
      this.assertAllFound(targets, dto.ids, 'circular');

      const decided = await this.repo.decideCirculars(
        tx,
        dto.ids,
        approved,
        ctx.userId,
      );

      this.audit('comms.announcement', dto, approved);
      return { decided, requested: dto.ids.length };
    });
  }

  /**
   * A row missing from the tenant-scoped read is a row in another school. Fail
   * the whole batch rather than silently deciding the subset that was visible.
   */
  private assertAllFound(
    found: Array<{ id: string }>,
    ids: string[],
    label: string,
  ): void {
    if (found.length === ids.length) return;
    const seen = new Set(found.map((f) => f.id));
    throw new ApiException(
      404,
      'NOT_FOUND',
      `One or more items are no longer in your ${label} queue.`,
      { missing: ids.filter((id) => !seen.has(id)) },
    );
  }

  private audit(entityType: string, dto: DecideDto, approved: boolean): void {
    for (const id of dto.ids) {
      RequestContextStore.addAudit({
        action: approved ? `${entityType}.approved` : `${entityType}.rejected`,
        entityType,
        entityId: id,
        changes: {
          status: { from: 'pending', to: approved ? 'approved' : 'rejected' },
          ...(approved ? {} : { reason: { from: null, to: dto.reason } }),
        },
      });
    }
  }

  /** Staff leave has no section, so a narrow grant simply sees none of it. */
  private canSeeStaffLeave(grant: GrantedPermission | undefined): boolean {
    if (!grant) return false;
    return grant.scope === 'tenant' || grant.scope === 'branch';
  }
}

/**
 * Student-linked queues filter on the enrolment's section. Without a grant the
 * caller cannot act on the group at all, and an empty list is the honest
 * result — never the unfiltered one.
 */
function studentScope(grant: GrantedPermission | undefined, branchId: string) {
  if (!grant) return scopeFilter(
    { code: 'none', scope: 'section', sectionIds: [] },
    { sectionId: studentEnrollments.sectionId },
  );
  return scopeFilter(
    grant,
    {
      sectionId: studentEnrollments.sectionId,
      studentId: studentEnrollments.studentId,
      branchId: studentEnrollments.branchId,
    },
    { branchId },
  );
}

function assertRowInScope(
  grant: GrantedPermission,
  sectionId: string | null,
  studentId: string | null,
): void {
  if (grant.scope === 'tenant' || grant.scope === 'branch') return;
  if (grant.scope === 'section') {
    if (!sectionId || !(grant.sectionIds ?? []).includes(sectionId)) {
      throw new ForbiddenException('Outside your assigned sections.');
    }
    return;
  }
  if (grant.scope === 'self') {
    if (!studentId || !(grant.studentIds ?? []).includes(studentId)) {
      throw new ForbiddenException('Not your record.');
    }
    return;
  }
  throw new ForbiddenException('Unknown permission scope');
}

function requireReason(dto: DecideDto): boolean {
  const approved = dto.action === 'approve';
  if (!approved && !dto.reason?.trim()) {
    throw new ApiException(
      422,
      'BUSINESS_RULE',
      'Give a reason when rejecting — the person who asked will be shown it.',
    );
  }
  return approved;
}

function fullName(first: string | null, last: string | null): string {
  return [first, last].filter(Boolean).join(' ') || 'Unnamed';
}

function classLabel(className: string | null, sectionName: string | null) {
  if (!className) return null;
  return sectionName ? `${className}-${sectionName}` : className;
}

function dateRange(from: string, to: string, days: number): string {
  const span = from === to ? from : `${from} to ${to}`;
  return `${span} · ${days} day${days === 1 ? '' : 's'}`;
}

/** Percentages format fine here; rupees are left as paise for the client's
 *  money formatter, per the "format only at the edge" rule. */
function concessionSummary(
  type: string,
  percentageBp: number | null,
): string {
  const label = type.replace(/_/g, ' ');
  return percentageBp ? `${label} · ${percentageBp / 100}%` : label;
}

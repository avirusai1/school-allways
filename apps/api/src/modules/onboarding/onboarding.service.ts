import { Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';

import {
  academicSessions,
  branches,
  calendarDays,
  classes,
  deliveryAttempts,
  guardians,
  importBatches,
  joinTokens,
  onboardingCallbacks,
  onboardingEvents,
  referrals,
  sections,
  staff,
  studentEnrollments,
  studentGuardians,
  students,
  subjects,
  tenantSettings,
  tenants,
  terms,
  userTenantMemberships,
  users,
} from '@saw/db';

import { RequestContextStore } from '../../common/context/request-context';
import { TenantDbService } from '../../common/database/tenant-db.service';
import { ApiException } from '../../common/errors/api.exception';
import { StorageService } from '../../common/storage/storage.service';
import { generateOpaqueToken, sha256 } from '../../common/utils/crypto.util';
import { publicFileUrl } from '../../common/utils/url.util';
import { classesForBoard, subjectsForBoard } from '../academic/board-templates';
import { GrowthService } from '../growth/growth.service';
import { NotificationService } from '../notifications/notification.service';
import type {
  CallbackRequestDto,
  CompleteStepDto,
  InviteParentsDto,
  InviteStaffDto,
} from './dto/onboarding.dto';
import { holidaysInRange } from './indian-holidays';
import {
  ONBOARDING_STEPS,
  STEP_ESTIMATE_MINUTES,
  isOnboardingStep,
  nextStep,
  type OnboardingStep,
  type StepProgress,
  type StepStatus,
} from './onboarding.constants';

const PROGRESS_KEY = 'onboarding.progress';

/**
 * Two bases, chosen by purpose. A parent's link has to open the family app and
 * a teacher's the admin app; one shared base could only work with a redirector
 * service in front of it, and there isn't one. Both reuse the URLs already
 * configured for CORS rather than adding a third way to say where the web apps
 * live.
 */
function joinBaseFor(purpose: 'parent_profile' | 'staff_invite' | 'student_invite'): string {
  const family =
    process.env.FAMILY_WEB_URL ?? 'https://family.school.techallways.com';
  const admin = process.env.ADMIN_WEB_URL ?? 'https://admin.school.techallways.com';
  return `${(purpose === 'staff_invite' ? admin : family).replace(/\/+$/, '')}/join`;
}

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly db: TenantDbService,
    private readonly notifications: NotificationService,
    private readonly growth: GrowthService,
    private readonly storage: StorageService,
  ) {}

  async getState() {
    const ctx = RequestContextStore.get();
    const filesBase =
      process.env.FILES_BASE_URL ?? 'http://localhost:3001/files';
    return this.db.run(async (tx) => {
      const [tenant] = await tx
        .select({
          name: tenants.name,
          logoPath: tenants.logoPath,
          onboardingStep: tenants.onboardingStep,
          hasSampleData: tenants.hasSampleData,
          activatedAt: tenants.activatedAt,
          onboardingCompletedAt: tenants.onboardingCompletedAt,
        })
        .from(tenants)
        .where(eq(tenants.id, ctx.tenantId!))
        .limit(1);

      if (!tenant) throw new ApiException(404, 'NOT_FOUND', 'Tenant not found');

      const [branch] = ctx.branchId
        ? await tx
            .select({
              board: branches.board,
              affiliationNo: branches.affiliationNo,
              udiseCode: branches.udiseCode,
              addressLine1: branches.addressLine1,
              city: branches.city,
              state: branches.state,
              pincode: branches.pincode,
              phone: branches.phone,
              email: branches.email,
            })
            .from(branches)
            .where(eq(branches.id, ctx.branchId))
            .limit(1)
        : [null];

      const progress = await this.loadProgress(tx, ctx.tenantId!);
      const currentStep = (tenant.onboardingStep ?? 'school_profile') as OnboardingStep;

      const steps = ONBOARDING_STEPS.map((key) => {
        const p = progress[key];
        let status: StepStatus = p?.status ?? 'pending';
        if (key === currentStep && status === 'pending') status = 'in_progress';
        return {
          key,
          status,
          completedAt: p?.completedAt ?? null,
          itemCount: p?.itemCount ?? null,
        };
      });

      const done = steps.filter(
        (s) => s.status === 'completed' || s.status === 'skipped',
      ).length;
      const progressPercent = Math.round((done / ONBOARDING_STEPS.length) * 100);

      const remaining = steps
        .filter((s) => s.status === 'pending' || s.status === 'in_progress')
        .reduce((sum, s) => sum + (STEP_ESTIMATE_MINUTES[s.key as OnboardingStep] ?? 2), 0);

      return {
        currentStep,
        steps,
        progressPercent,
        hasSampleData: tenant.hasSampleData,
        activatedAt: tenant.activatedAt?.toISOString() ?? null,
        onboardingCompletedAt: tenant.onboardingCompletedAt?.toISOString() ?? null,
        canSkipCurrent: currentStep !== 'first_attendance' || !!tenant.activatedAt,
        estimatedMinutesRemaining: remaining,
        profile: {
          name: tenant.name,
          board: branch?.board ?? 'cbse',
          affiliationNo: branch?.affiliationNo ?? null,
          udiseCode: branch?.udiseCode ?? null,
          address: branch?.addressLine1 ?? null,
          city: branch?.city ?? null,
          state: branch?.state ?? null,
          pincode: branch?.pincode ?? null,
          phone: branch?.phone ?? null,
          email: branch?.email ?? null,
          logoUrl: publicFileUrl(filesBase, tenant.logoPath),
        },
      };
    });
  }

  async completeStep(step: string, dto: CompleteStepDto) {
    if (!isOnboardingStep(step)) {
      throw new ApiException(400, 'VALIDATION_ERROR', `Unknown onboarding step '${step}'.`);
    }

    const action =
      dto.action === 'completed'
        ? 'complete'
        : dto.action === 'skipped'
          ? 'skip'
          : dto.action;

    const ctx = RequestContextStore.get();
    const itemCount = await this.db.run(async (tx) => {
      const progress = await this.loadProgress(tx, ctx.tenantId!);
      const nowIso = new Date().toISOString();

      if (action === 'started') {
        const prior = progress[step];
        progress[step] = {
          status:
            prior?.status === 'completed' || prior?.status === 'skipped'
              ? prior.status
              : 'in_progress',
          completedAt: prior?.completedAt,
          itemCount: prior?.itemCount,
          startedAt: prior?.startedAt ?? nowIso,
        };
        await this.saveProgress(tx, ctx.tenantId!, progress);
        await tx.insert(onboardingEvents).values({
          tenantId: ctx.tenantId!,
          step,
          action: 'started',
          durationSeconds: null,
          itemCount: null,
        });
        return prior?.itemCount ?? 0;
      }

      const startedAt = progress[step]?.startedAt ?? nowIso;
      let resolvedCount = dto.itemCount ?? 0;

      if (action === 'complete') {
        // applyStepData counts what it created. For classes/subjects that is 0
        // when the client already saved the rows itself, so keep the client's
        // count rather than reporting an empty step to the funnel.
        const applied = await this.applyStepData(tx, step, dto.data ?? {}, ctx);
        resolvedCount = applied > 0 ? applied : (dto.itemCount ?? 0);

        // Import and invite steps have no server-side apply — the client used
        // to supply itemCount unchecked, so a forged "completed" could claim
        // rows were imported when nothing was committed. Measure from the DB.
        const measured = await this.measuredStepOutcome(tx, step, ctx.tenantId!);
        if (measured !== null) {
          if (measured === 0) {
            throw new ApiException(400, 'STEP_NOT_READY', this.stepNotReadyMessage(step));
          }
          resolvedCount = measured;
        }
      }

      const status: StepStatus = action === 'skip' ? 'skipped' : 'completed';
      const completedAt = nowIso;
      progress[step] = {
        status,
        completedAt,
        itemCount: resolvedCount,
        startedAt,
      };

      const nxt = nextStep(step);
      // Advance only if this is the current (or earlier) step — allow re-order.
      const [tenant] = await tx
        .select({ onboardingStep: tenants.onboardingStep })
        .from(tenants)
        .where(eq(tenants.id, ctx.tenantId!))
        .limit(1);

      const current = (tenant?.onboardingStep ?? 'school_profile') as OnboardingStep;
      const shouldAdvance =
        current === step ||
        ONBOARDING_STEPS.indexOf(step) >= ONBOARDING_STEPS.indexOf(current);

      await this.saveProgress(tx, ctx.tenantId!, progress);

      if (shouldAdvance && nxt) {
        await tx
          .update(tenants)
          .set({ onboardingStep: nxt })
          .where(eq(tenants.id, ctx.tenantId!));
      } else if (shouldAdvance && !nxt) {
        await tx
          .update(tenants)
          .set({
            onboardingStep: 'first_attendance',
            onboardingCompletedAt: new Date(),
          })
          .where(eq(tenants.id, ctx.tenantId!));
      }

      await tx.insert(onboardingEvents).values({
        tenantId: ctx.tenantId!,
        step,
        action: action === 'skip' ? 'skipped' : 'completed',
        durationSeconds: dto.durationSeconds ?? null,
        itemCount: resolvedCount,
      });

      RequestContextStore.addAudit({
        action: `onboarding.step.${action}`,
        entityType: 'tenants',
        entityId: ctx.tenantId!,
        changes: { step: { from: current, to: nxt ?? step } },
      });

      return resolvedCount;
    });

    return this.getState().then((state) => ({ ...state, lastItemCount: itemCount }));
  }

  async uploadLogo(file: Express.Multer.File) {
    const ctx = RequestContextStore.get();
    if (!file?.buffer?.length && !file?.path) {
      throw new ApiException(400, 'VALIDATION_ERROR', 'Choose a logo image to upload.');
    }
    const ext = (file.originalname.split('.').pop() ?? 'png')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    const key = `t/${ctx.tenantId}/branding/logo.${ext || 'png'}`;
    const { promises: fs } = await import('node:fs');
    const data = file.buffer?.length
      ? file.buffer
      : await fs.readFile(file.path);
    await this.storage.writeBuffer(key, data);

    await this.db.run(async (tx) => {
      await tx
        .update(tenants)
        .set({ logoPath: key })
        .where(eq(tenants.id, ctx.tenantId!));
    });

    const filesBase =
      process.env.FILES_BASE_URL ?? 'http://localhost:3001/files';
    return { logoPath: key, logoUrl: publicFileUrl(filesBase, key) };
  }

  async wipeSampleData() {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [tenant] = await tx
        .select({ hasSampleData: tenants.hasSampleData })
        .from(tenants)
        .where(eq(tenants.id, ctx.tenantId!))
        .limit(1);

      if (!tenant?.hasSampleData) {
        return { wiped: false, reason: 'No sample data loaded.' };
      }

      const sampleStudents = await tx
        .select({ id: students.id })
        .from(students)
        .where(
          and(
            eq(students.tenantId, ctx.tenantId!),
            sql`(${students.customFields}->>'isSample')::boolean = true`,
          ),
        );

      const ids = sampleStudents.map((s) => s.id);
      if (ids.length) {
        await tx
          .delete(studentGuardians)
          .where(inArray(studentGuardians.studentId, ids));
        await tx
          .delete(studentEnrollments)
          .where(inArray(studentEnrollments.studentId, ids));
        // Guardians linked only to sample kids — delete orphans with DEMO phones.
        await tx
          .delete(guardians)
          .where(
            and(
              eq(guardians.tenantId, ctx.tenantId!),
              sql`${guardians.phone} LIKE '91000000%'`,
            ),
          );
        await tx.delete(students).where(inArray(students.id, ids));
      }

      // Demo class/section named explicitly.
      const demoClasses = await tx
        .select({ id: classes.id })
        .from(classes)
        .where(and(eq(classes.tenantId, ctx.tenantId!), eq(classes.name, 'Demo V')));

      for (const c of demoClasses) {
        await tx.delete(sections).where(eq(sections.classId, c.id));
        await tx.delete(classes).where(eq(classes.id, c.id));
      }

      await tx
        .update(tenants)
        .set({ hasSampleData: false })
        .where(eq(tenants.id, ctx.tenantId!));

      await tx.insert(onboardingEvents).values({
        tenantId: ctx.tenantId!,
        step: 'sample_data',
        action: 'completed',
        itemCount: ids.length,
      });

      return { wiped: true, studentsRemoved: ids.length };
    });
  }

  async inviteStaff(dto: InviteStaffDto) {
    const ctx = RequestContextStore.get();
    const tenantId = ctx.tenantId!;

    const pending = await this.db.run(async (tx) => {
      // Joined through `staff`, not just membership: guardians are also
      // members in `invited` state, and inviting them here would send 400
      // parents a message telling them they are staff.
      let memberships = await tx
        .selectDistinct({
          userId: userTenantMemberships.userId,
          phone: users.phone,
          email: users.email,
          workEmail: staff.workEmail,
          fullName: users.fullName,
        })
        .from(userTenantMemberships)
        .innerJoin(users, eq(users.id, userTenantMemberships.userId))
        .innerJoin(
          staff,
          and(eq(staff.userId, userTenantMemberships.userId), eq(staff.tenantId, tenantId)),
        )
        .where(
          and(
            eq(userTenantMemberships.tenantId, tenantId),
            eq(userTenantMemberships.status, 'invited'),
          ),
        );

      if (dto.userIds?.length) {
        memberships = memberships.filter((m) => dto.userIds!.includes(m.userId));
      } else if (!dto.all && !dto.userIds) {
        throw new ApiException(
          400,
          'VALIDATION_ERROR',
          'Pass userIds or all=true to invite staff.',
        );
      }

      const eligible = memberships.filter((m) => m.email || m.workEmail);

      // Notification dispatch reads users.email. Copy work email onto the
      // login row when the import left it blank, so the invite can actually
      // leave the building.
      const missingLoginEmail = eligible.filter((m) => !m.email && m.workEmail);
      for (const m of missingLoginEmail) {
        const workEmail = m.workEmail!.trim().toLowerCase();
        await tx
          .update(users)
          .set({ email: workEmail })
          .where(and(eq(users.id, m.userId), isNull(users.email)));
        m.email = workEmail;
      }

      const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const invites = eligible.map((m) => ({ ...m, token: generateOpaqueToken() }));

      if (invites.length) {
        // One statement, not one per teacher — a 60-staff school was issuing 60
        // round trips inside an open transaction.
        await tx.insert(joinTokens).values(
          invites.map((i) => ({
            tenantId,
            branchId: ctx.branchId,
            tokenHash: sha256(i.token),
            purpose: 'staff_invite',
            userId: i.userId,
            phone: i.phone,
            expiresAt,
          })),
        );
      }

      return invites;
    });

    // Fan-out writes to the delivery ledger and Redis, so it stays outside the
    // transaction. The step's own onboarding_events row is written by
    // completeStep — don't double-count it here.
    const queued = await this.fanOutInvites(
      pending.map((i) => ({
        userId: i.userId,
        token: i.token,
        variables: { name: i.fullName ?? '' },
      })),
      {
        tenantId,
        templateCode: 'STAFF_INVITE',
        channels: ['email'],
        label: 'Staff',
        purpose: 'staff_invite',
      },
    );

    return {
      invited: pending.length,
      queued,
      deepLinkBase: joinBaseFor('staff_invite'),
    };
  }

  /**
   * One notify() call for the whole cohort. Each recipient carries its own deep
   * link in per-recipient variables, so 400 parents cost one queue write rather
   * than 400 — and one failure mode instead of 400 independent ones.
   */
  async dispatchJoinInvites(
    recipients: Array<{
      userId: string | null;
      studentId?: string | null;
      token: string;
      variables: Record<string, string>;
    }>,
    opts: {
      tenantId: string;
      templateCode: string;
      channels: Array<'email' | 'sms' | 'whatsapp' | 'in_app' | 'push'>;
      label: string;
      purpose: 'parent_profile' | 'staff_invite' | 'student_invite';
    },
  ): Promise<number> {
    return this.fanOutInvites(recipients, opts);
  }

  private async fanOutInvites(
    recipients: Array<{
      userId: string | null;
      studentId?: string | null;
      token: string;
      variables: Record<string, string>;
    }>,
    opts: {
      tenantId: string;
      templateCode: string;
      channels: Array<'email' | 'sms' | 'whatsapp' | 'in_app' | 'push'>;
      label: string;
      purpose: 'parent_profile' | 'staff_invite' | 'student_invite';
    },
  ): Promise<number> {
    const addressable = recipients.filter((r) => r.userId);
    if (addressable.length === 0) return 0;

    const schoolName = await this.schoolName(opts.tenantId);
    const joinBase = joinBaseFor(opts.purpose);

    try {
      const { queued } = await this.notifications.notify({
        tenantId: opts.tenantId,
        templateCode: opts.templateCode,
        recipients: addressable.map((r) => ({
          userId: r.userId!,
          ...(r.studentId ? { studentId: r.studentId } : {}),
          variables: { ...r.variables, link: `${joinBase}/${r.token}` },
        })),
        variables: { schoolName },
        priority: 'high',
        channels: opts.channels,
      });
      return queued;
    } catch (err) {
      this.logger.error(
        `${opts.label} invite fan-out failed for ${addressable.length} recipients: ` +
          (err instanceof Error ? err.message : String(err)),
      );
      return 0;
    }
  }

  private async schoolName(tenantId: string): Promise<string> {
    const [row] = await this.db.asTenant(tenantId, (tx) =>
      tx.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1),
    );
    return row?.name ?? 'Your school';
  }

  /**
   * Counts behind steps 7–8: who can be invited, who was, who has actually
   * joined. `join_tokens.consumed_at` is the join signal. Parents are broken
   * down by section so a cautious school can pilot one class at a time.
   */
  async inviteStatus() {
    const ctx = RequestContextStore.get();
    const tenantId = ctx.tenantId!;

    return this.db.run(async (tx) => {
      const notSample = sql`coalesce((${students.customFields}->>'isSample')::boolean, false) = false`;

      // Must match inviteStaff's own definition of who is invitable, or the
      // step offers to send a number of invitations it will not send.
      const [staffEligible] = await tx
        .select({ n: sql<number>`count(distinct ${userTenantMemberships.userId})::int` })
        .from(userTenantMemberships)
        .innerJoin(users, eq(users.id, userTenantMemberships.userId))
        .innerJoin(
          staff,
          and(eq(staff.userId, userTenantMemberships.userId), eq(staff.tenantId, tenantId)),
        )
        .where(
          and(
            eq(userTenantMemberships.tenantId, tenantId),
            eq(userTenantMemberships.status, 'invited'),
            sql`coalesce(${users.email}, ${staff.workEmail}) is not null`,
          ),
        );

      // Imported staff are personnel records, not logins. Until someone gives
      // them a user account there is nobody to invite, and the step has to say
      // so rather than showing a bare zero.
      const [staffNoAccount] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(staff)
        .where(
          and(
            eq(staff.tenantId, tenantId),
            isNull(staff.userId),
            sql`${staff.workEmail} is not null`,
          ),
        );

      const [staffTokens] = await tx
        .select({
          invited: sql<number>`count(distinct ${joinTokens.userId})::int`,
          joined: sql<number>`(count(distinct ${joinTokens.userId}) filter (where ${joinTokens.consumedAt} is not null))::int`,
        })
        .from(joinTokens)
        .where(
          and(eq(joinTokens.tenantId, tenantId), eq(joinTokens.purpose, 'staff_invite')),
        );

      const sectionRows = await tx
        .select({
          id: sections.id,
          name: sections.name,
          className: classes.name,
          level: classes.level,
        })
        .from(sections)
        .innerJoin(classes, eq(classes.id, sections.classId))
        .innerJoin(
          academicSessions,
          and(
            eq(academicSessions.id, sections.academicSessionId),
            eq(academicSessions.isCurrent, true),
          ),
        )
        .where(
          and(
            eq(sections.tenantId, tenantId),
            ctx.branchId ? eq(sections.branchId, ctx.branchId) : sql`true`,
          ),
        )
        .orderBy(classes.level, sections.name);

      const eligibleRows = await tx
        .select({
          sectionId: studentEnrollments.sectionId,
          n: sql<number>`count(distinct ${students.id})::int`,
        })
        .from(studentEnrollments)
        .innerJoin(students, eq(students.id, studentEnrollments.studentId))
        .innerJoin(
          studentGuardians,
          and(
            eq(studentGuardians.studentId, students.id),
            eq(studentGuardians.isPrimary, true),
          ),
        )
        .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
        .where(
          and(
            eq(studentEnrollments.tenantId, tenantId),
            inArray(studentEnrollments.status, ['active', 'admitted']),
            sql`${guardians.email} is not null`,
            notSample,
          ),
        )
        .groupBy(studentEnrollments.sectionId);

      const parentTokenRows = await tx
        .select({
          sectionId: studentEnrollments.sectionId,
          invited: sql<number>`count(distinct ${joinTokens.studentId})::int`,
          joined: sql<number>`(count(distinct ${joinTokens.studentId}) filter (where ${joinTokens.consumedAt} is not null))::int`,
        })
        .from(joinTokens)
        .innerJoin(
          studentEnrollments,
          and(
            eq(studentEnrollments.studentId, joinTokens.studentId),
            inArray(studentEnrollments.status, ['active', 'admitted']),
          ),
        )
        .where(
          and(
            eq(joinTokens.tenantId, tenantId),
            eq(joinTokens.purpose, 'parent_profile'),
          ),
        )
        .groupBy(studentEnrollments.sectionId);

      const eligibleBySection = new Map(eligibleRows.map((r) => [r.sectionId, r.n]));
      const tokensBySection = new Map(parentTokenRows.map((r) => [r.sectionId, r]));

      const sectionsOut = sectionRows.map((s) => ({
        sectionId: s.id,
        label: `${s.className}-${s.name}`,
        eligible: eligibleBySection.get(s.id) ?? 0,
        invited: tokensBySection.get(s.id)?.invited ?? 0,
        joined: tokensBySection.get(s.id)?.joined ?? 0,
      }));

      const sum = (key: 'eligible' | 'invited' | 'joined') =>
        sectionsOut.reduce((acc, s) => acc + s[key], 0);

      // Whether the message actually left is a different question from whether
      // a token was issued, and the wizard was previously only able to answer
      // the second one. One grouped read over the ledger answers the first.
      const deliveryRows = await tx
        .select({
          templateCode: deliveryAttempts.templateCode,
          pending: sql<number>`(count(*) filter (where ${deliveryAttempts.status} = 'queued'))::int`,
          sent: sql<number>`(count(*) filter (where ${deliveryAttempts.status} in ('sent','delivered','read')))::int`,
          failed: sql<number>`(count(*) filter (where ${deliveryAttempts.status} = 'failed'))::int`,
        })
        .from(deliveryAttempts)
        .where(
          and(
            eq(deliveryAttempts.tenantId, tenantId),
            inArray(deliveryAttempts.templateCode, [
              'STAFF_INVITE',
              'PARENT_PROFILE_INVITE',
            ]),
            // in_app is a row, not a send; counting it would make every invite
            // look delivered even when no phone was ever reached.
            ne(deliveryAttempts.channel, 'in_app'),
          ),
        )
        .groupBy(deliveryAttempts.templateCode);

      const delivery = (code: string) => {
        const row = deliveryRows.find((r) => r.templateCode === code);
        return {
          pending: row?.pending ?? 0,
          sent: row?.sent ?? 0,
          failed: row?.failed ?? 0,
        };
      };

      return {
        staff: {
          eligible: staffEligible?.n ?? 0,
          invited: staffTokens?.invited ?? 0,
          joined: staffTokens?.joined ?? 0,
          withoutAccounts: staffNoAccount?.n ?? 0,
          delivery: delivery('STAFF_INVITE'),
        },
        parents: {
          eligible: sum('eligible'),
          invited: sum('invited'),
          joined: sum('joined'),
          sections: sectionsOut,
          delivery: delivery('PARENT_PROFILE_INVITE'),
        },
      };
    });
  }

  async inviteParents(dto: InviteParentsDto) {
    const ctx = RequestContextStore.get();
    const tenantId = ctx.tenantId!;

    const pending = await this.db.run(async (tx) => {
      const enrollmentConds = [
        eq(studentEnrollments.tenantId, tenantId),
        inArray(studentEnrollments.status, ['active', 'admitted']),
        // Never invite sample guardians.
        sql`coalesce((${students.customFields}->>'isSample')::boolean, false) = false`,
      ];
      if (dto.guardianIds?.length) {
        enrollmentConds.push(inArray(guardians.id, dto.guardianIds));
      } else if (dto.sectionIds?.length) {
        enrollmentConds.push(inArray(studentEnrollments.sectionId, dto.sectionIds));
      } else if (!dto.all) {
        throw new ApiException(
          400,
          'VALIDATION_ERROR',
          'Pass guardianIds, sectionIds, or all=true to invite parents.',
        );
      }

      const rows = await tx
        .select({
          studentId: students.id,
          guardianUserId: guardians.userId,
          phone: guardians.phone,
          email: guardians.email,
          firstName: students.firstName,
        })
        .from(studentEnrollments)
        .innerJoin(students, eq(students.id, studentEnrollments.studentId))
        .innerJoin(
          studentGuardians,
          and(
            eq(studentGuardians.studentId, students.id),
            eq(studentGuardians.isPrimary, true),
          ),
        )
        .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
        .where(and(...enrollmentConds));

      const eligible = rows.filter((r) => r.email);
      const userIds = [
        ...new Set(eligible.map((r) => r.guardianUserId).filter((id): id is string => Boolean(id))),
      ];
      if (userIds.length) {
        // Dispatch reads users.email. Copy the guardian contact email onto the
        // login row when import left it blank. One statement — a 400-parent
        // year-group must not be 400 round trips.
        await tx.execute(sql`
          update users as u
          set email = lower(g.email)
          from guardians g
          where g.user_id = u.id
            and g.tenant_id = ${tenantId}
            and u.email is null
            and g.email is not null
            and u.id in (${sql.join(
              userIds.map((id) => sql`${id}::uuid`),
              sql`, `,
            )})
        `);
      }

      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const invites = eligible.map((r) => ({ ...r, token: generateOpaqueToken() }));

      if (invites.length) {
        // A 400-student section was previously one INSERT per child.
        await tx.insert(joinTokens).values(
          invites.map((i) => ({
            tenantId,
            branchId: ctx.branchId,
            tokenHash: sha256(i.token),
            purpose: 'parent_profile',
            studentId: i.studentId,
            userId: i.guardianUserId,
            phone: i.phone,
            expiresAt,
          })),
        );
      }

      return invites;
    });

    // Guardians without a user account still get a token but cannot be emailed
    // until a login row exists — they count as invited and are skipped here.
    const queued = await this.fanOutInvites(
      pending.map((i) => ({
        userId: i.guardianUserId,
        studentId: i.studentId,
        token: i.token,
        variables: { studentName: i.firstName },
      })),
      {
        tenantId,
        templateCode: 'PARENT_PROFILE_INVITE',
        channels: ['email'],
        label: 'Parent',
        purpose: 'parent_profile',
      },
    );

    return {
      invited: pending.length,
      queued,
      deepLinkBase: joinBaseFor('parent_profile'),
    };
  }

  async requestCallback(dto: CallbackRequestDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [row] = await tx
        .insert(onboardingCallbacks)
        .values({
          tenantId: ctx.tenantId!,
          requestedByUserId: ctx.userId,
          preferredTime: dto.preferredTime ?? null,
          note: dto.note ?? null,
          status: 'open',
        })
        .returning({ id: onboardingCallbacks.id });

      await tx.insert(onboardingEvents).values({
        tenantId: ctx.tenantId!,
        step: 'callback',
        action: 'started',
        itemCount: 1,
      });

      return { id: row.id, status: 'open' as const };
    });
  }

  /**
   * Called from AttendanceService.mark on the first successful register.
   * Idempotent — only sets activatedAt when null.
   */
  async markActivated(tenantId: string): Promise<boolean> {
    const updated = await this.db.asTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(tenants)
        .set({ activatedAt: new Date() })
        .where(and(eq(tenants.id, tenantId), isNull(tenants.activatedAt)))
        .returning({ id: tenants.id });

      if (!row) return false;

      // 'activated', not 'completed': the wizard step writes its own completed
      // row, and two of them would double-count the step in the funnel.
      await tx.insert(onboardingEvents).values({
        tenantId,
        step: 'first_attendance',
        action: 'activated',
        itemCount: 1,
      });

      await tx
        .update(tenants)
        .set({ onboardingStep: 'first_attendance', onboardingCompletedAt: new Date() })
        .where(eq(tenants.id, tenantId));

      return true;
    });

    if (updated) {
      await this.rewardReferralOnActivation(tenantId);
      // A swallowed failure here is a referral reward the referrer earned and
      // never received, with no record that it was owed.
      await this.growth.grantRewardIfActivated(tenantId).catch((err: unknown) => {
        this.logger.error(
          `Referral reward check failed for activated tenant=${tenantId}; ` +
            `a reward may be owed and ungranted: ` +
            (err instanceof Error ? err.message : String(err)),
        );
      });
    }
    return updated;
  }

  private async rewardReferralOnActivation(referredTenantId: string): Promise<void> {
    await RequestContextStore.run(
      {
        requestId: `activation-referral-${referredTenantId}`,
        userId: null,
        tenantId: null,
        branchId: null,
        sessionId: null,
        roleCodes: [],
        permissions: new Map(),
        isPlatformAdmin: true,
        impersonatorUserId: null,
        auditTrail: [],
        piiReads: [],
      },
      async () => {
        await this.db.run(async (tx) => {
          await tx
            .update(referrals)
            .set({
              status: 'activated',
              activatedAt: new Date(),
            })
            .where(
              and(
                eq(referrals.referredTenantId, referredTenantId),
                inArray(referrals.status, ['signed_up', 'sent']),
              ),
            );
        });
      },
    );
  }

  private stepNotReadyMessage(step: OnboardingStep): string {
    switch (step) {
      case 'import_staff':
        return 'Import at least one staff member before completing this step, or skip it for now.';
      case 'import_students':
        return 'Import at least one student before completing this step, or skip it for now.';
      case 'invite_staff':
        return 'Send staff invitations before completing this step, or skip it for now.';
      case 'invite_parents':
        return 'Send parent invitations before completing this step, or skip it for now.';
      default:
        return 'Complete this step before continuing, or skip it for now.';
    }
  }

  /**
   * Steps whose only effect is an import or invite fan-out have nothing for
   * applyStepData to count. Return null when the step is not evidence-backed.
   */
  private async measuredStepOutcome(
    tx: Parameters<Parameters<TenantDbService['run']>[0]>[0],
    step: OnboardingStep,
    tenantId: string,
  ): Promise<number | null> {
    switch (step) {
      case 'import_staff': {
        const [row] = await tx
          .select({
            n: sql<number>`coalesce(sum(${importBatches.committedRows}), 0)::int`,
          })
          .from(importBatches)
          .where(
            and(
              eq(importBatches.tenantId, tenantId),
              eq(importBatches.entity, 'staff'),
              eq(importBatches.status, 'committed'),
            ),
          );
        return row?.n ?? 0;
      }
      case 'import_students': {
        const [row] = await tx
          .select({
            n: sql<number>`coalesce(sum(${importBatches.committedRows}), 0)::int`,
          })
          .from(importBatches)
          .where(
            and(
              eq(importBatches.tenantId, tenantId),
              eq(importBatches.entity, 'students'),
              eq(importBatches.status, 'committed'),
            ),
          );
        return row?.n ?? 0;
      }
      case 'invite_staff': {
        const [row] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(joinTokens)
          .where(
            and(eq(joinTokens.tenantId, tenantId), eq(joinTokens.purpose, 'staff_invite')),
          );
        return row?.n ?? 0;
      }
      case 'invite_parents': {
        const [row] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(joinTokens)
          .where(
            and(
              eq(joinTokens.tenantId, tenantId),
              eq(joinTokens.purpose, 'parent_profile'),
            ),
          );
        return row?.n ?? 0;
      }
      default:
        return null;
    }
  }

  private async applyStepData(
    tx: Parameters<Parameters<TenantDbService['run']>[0]>[0],
    step: OnboardingStep,
    data: Record<string, unknown>,
    ctx: ReturnType<typeof RequestContextStore.get>,
  ): Promise<number> {
    switch (step) {
      case 'school_profile': {
        const name = typeof data.name === 'string' ? data.name.trim() : null;
        const board = typeof data.board === 'string' ? data.board : null;
        const logoPath = typeof data.logoPath === 'string' ? data.logoPath : null;

        if (name || logoPath) {
          await tx
            .update(tenants)
            .set({
              ...(name ? { name } : {}),
              ...(logoPath ? { logoPath } : {}),
            })
            .where(eq(tenants.id, ctx.tenantId!));
        }

        if (ctx.branchId) {
          const branchPatch: Record<string, unknown> = {};
          if (board) branchPatch.board = board;
          if (typeof data.affiliationNo === 'string') {
            branchPatch.affiliationNo = data.affiliationNo.trim() || null;
          }
          if (typeof data.udiseCode === 'string') {
            branchPatch.udiseCode = data.udiseCode.trim() || null;
          }
          if (typeof data.address === 'string') {
            branchPatch.addressLine1 = data.address.trim() || null;
          }
          if (typeof data.city === 'string') branchPatch.city = data.city.trim() || null;
          if (typeof data.state === 'string') branchPatch.state = data.state.trim() || null;
          if (typeof data.pincode === 'string') {
            branchPatch.pincode = data.pincode.trim() || null;
          }
          if (typeof data.phone === 'string') branchPatch.phone = data.phone.trim() || null;
          if (typeof data.email === 'string') branchPatch.email = data.email.trim() || null;

          if (Object.keys(branchPatch).length > 0) {
            await tx
              .update(branches)
              .set(branchPatch)
              .where(eq(branches.id, ctx.branchId));
          }
        }
        return 1;
      }
      case 'academic_session': {
        const sessionName =
          typeof data.name === 'string'
            ? data.name
            : `${new Date().getFullYear()}-${String(new Date().getFullYear() + 1).slice(-2)}`;
        const startDate =
          typeof data.startDate === 'string' ? data.startDate : `${new Date().getFullYear()}-04-01`;
        const endDate =
          typeof data.endDate === 'string'
            ? data.endDate
            : `${new Date().getFullYear() + 1}-03-31`;
        const termStructure =
          typeof data.termStructure === 'string' ? data.termStructure : '2_terms';
        const addHolidays = data.addNationalHolidays === true;

        let sessionId: string | undefined;
        const [existing] = await tx
          .select({ id: academicSessions.id })
          .from(academicSessions)
          .where(
            and(
              eq(academicSessions.tenantId, ctx.tenantId!),
              eq(academicSessions.branchId, ctx.branchId!),
              eq(academicSessions.name, sessionName),
            ),
          )
          .limit(1);

        if (existing) {
          sessionId = existing.id;
          await tx
            .update(academicSessions)
            .set({ startDate, endDate, isCurrent: true })
            .where(eq(academicSessions.id, sessionId));
        } else {
          await tx
            .update(academicSessions)
            .set({ isCurrent: false })
            .where(
              and(
                eq(academicSessions.tenantId, ctx.tenantId!),
                eq(academicSessions.branchId, ctx.branchId!),
              ),
            );
          const [created] = await tx
            .insert(academicSessions)
            .values({
              tenantId: ctx.tenantId!,
              branchId: ctx.branchId,
              name: sessionName,
              startDate,
              endDate,
              isCurrent: true,
              createdBy: ctx.userId,
            })
            .returning({ id: academicSessions.id });
          sessionId = created?.id;
        }

        if (!sessionId) return 0;

        await this.ensureTerms(tx, ctx.tenantId!, sessionId, startDate, endDate, termStructure);

        if (addHolidays) {
          const holidays = holidaysInRange(startDate, endDate);
          for (const h of holidays) {
            const [hit] = await tx
              .select({ id: calendarDays.id })
              .from(calendarDays)
              .where(
                and(
                  eq(calendarDays.academicSessionId, sessionId),
                  eq(calendarDays.day, h.day),
                ),
              )
              .limit(1);
            if (hit) continue;
            await tx.insert(calendarDays).values({
              tenantId: ctx.tenantId!,
              branchId: ctx.branchId,
              academicSessionId: sessionId,
              day: h.day,
              dayType: 'holiday',
              title: h.title,
            });
          }
        }

        return 1;
      }
      case 'classes':
      case 'subjects': {
        const board =
          typeof data.board === 'string'
            ? data.board
            : (
                await tx
                  .select({ board: branches.board })
                  .from(branches)
                  .where(eq(branches.id, ctx.branchId!))
                  .limit(1)
              )[0]?.board ?? 'cbse';

        if (!ctx.branchId) return 0;
        let count = 0;
        if (step === 'classes') {
          for (const cls of classesForBoard(board, -3, 12)) {
            const [hit] = await tx
              .select({ id: classes.id })
              .from(classes)
              .where(
                and(eq(classes.branchId, ctx.branchId), eq(classes.name, cls.name)),
              )
              .limit(1);
            if (hit) continue;
            await tx.insert(classes).values({
              tenantId: ctx.tenantId!,
              branchId: ctx.branchId,
              name: cls.name,
              level: cls.level,
              stage: cls.stage,
            });
            count++;
          }
        } else {
          for (const subj of subjectsForBoard(board)) {
            const [hit] = await tx
              .select({ id: subjects.id })
              .from(subjects)
              .where(
                and(eq(subjects.branchId, ctx.branchId), eq(subjects.code, subj.code)),
              )
              .limit(1);
            if (hit) continue;
            await tx.insert(subjects).values({
              tenantId: ctx.tenantId!,
              branchId: ctx.branchId,
              code: subj.code,
              name: subj.name,
              type: subj.type as never,
            });
            count++;
          }
        }
        return count;
      }
      default:
        return typeof data.itemCount === 'number' ? data.itemCount : 0;
    }
  }

  private async ensureTerms(
    tx: Parameters<Parameters<TenantDbService['run']>[0]>[0],
    tenantId: string,
    academicSessionId: string,
    startDate: string,
    endDate: string,
    termStructure: string,
  ): Promise<void> {
    const existing = await tx
      .select({ id: terms.id })
      .from(terms)
      .where(eq(terms.academicSessionId, academicSessionId))
      .limit(1);
    if (existing[0]) return;

    const start = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    const span = end.getTime() - start.getTime();

    const parts =
      termStructure === '4_quarters'
        ? 4
        : termStructure === '3_terms'
          ? 3
          : 2;
    const type = termStructure === '4_quarters' ? ('quarter' as const) : ('term' as const);

    for (let i = 0; i < parts; i += 1) {
      const segStart = new Date(start.getTime() + (span * i) / parts);
      const segEnd = new Date(start.getTime() + (span * (i + 1)) / parts);
      await tx.insert(terms).values({
        tenantId,
        academicSessionId,
        name: type === 'quarter' ? `Quarter ${i + 1}` : `Term ${i + 1}`,
        type,
        sequence: i + 1,
        startDate: segStart.toISOString().slice(0, 10),
        endDate: segEnd.toISOString().slice(0, 10),
      });
    }
  }

  private async loadProgress(
    tx: Parameters<Parameters<TenantDbService['run']>[0]>[0],
    tenantId: string,
  ): Promise<Partial<Record<OnboardingStep, StepProgress>>> {
    const [row] = await tx
      .select({ value: tenantSettings.value })
      .from(tenantSettings)
      .where(
        and(
          eq(tenantSettings.tenantId, tenantId),
          eq(tenantSettings.key, PROGRESS_KEY),
          isNull(tenantSettings.branchId),
        ),
      )
      .limit(1);

    if (!row?.value || typeof row.value !== 'object') return {};
    return row.value as Partial<Record<OnboardingStep, StepProgress>>;
  }

  private async saveProgress(
    tx: Parameters<Parameters<TenantDbService['run']>[0]>[0],
    tenantId: string,
    progress: Partial<Record<OnboardingStep, StepProgress>>,
  ): Promise<void> {
    const [existing] = await tx
      .select({ id: tenantSettings.id })
      .from(tenantSettings)
      .where(
        and(
          eq(tenantSettings.tenantId, tenantId),
          eq(tenantSettings.key, PROGRESS_KEY),
          isNull(tenantSettings.branchId),
        ),
      )
      .limit(1);

    if (existing) {
      await tx
        .update(tenantSettings)
        .set({ value: progress })
        .where(eq(tenantSettings.id, existing.id));
    } else {
      await tx.insert(tenantSettings).values({
        tenantId,
        key: PROGRESS_KEY,
        value: progress,
      });
    }
  }
}

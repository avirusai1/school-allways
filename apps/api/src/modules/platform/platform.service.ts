/**
 * Platform console — aggregate rollup tables ONLY.
 * Never import students, guardians, marks, invoices (fee), messages, payments.
 * student_subscriptions and platform_invoices are counts/totals — no names.
 */

import { Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';

import {
  onboardingEvents,
  partners,
  platformAnnouncements,
  platformInvoices,
  platformSupportSessions,
  plans,
  referrals,
  stayConnectedFees,
  studentSubscriptions,
  subscriptions,
  tenantHealth,
  tenantMetricsDaily,
  tenants,
  academicSessions,
} from '@saw/db';

import { RequestContextStore } from '../../common/context/request-context';
import { TenantDbService } from '../../common/database/tenant-db.service';
import { ApiException } from '../../common/errors/api.exception';
import { NotificationService } from '../notifications/notification.service';
import { PARENT_SUBSCRIPTION_TOTAL_PAISE } from '../subscriptions/billing.constants';
import { ensureStayConnectedFee } from '../subscriptions/stay-connected.util';
import type {
  CreateAnnouncementDto,
  CreateSupportSessionDto,
  MetricsRangeQuery,
  SchoolsQuery,
} from './dto/platform.dto';
import { ACTIVITY_COLUMNS } from './rollup.service';

@Injectable()
export class PlatformService {
  private readonly logger = new Logger(PlatformService.name);

  constructor(
    private readonly db: TenantDbService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Fleet dashboard — ONE query against tenant_health joined to latest metrics.
   * Keep this ≤ 3 queries total.
   */
  async fleet() {
    return this.db.run(async (tx) => {
      const rows = await tx
        .select({
          tenantId: tenantHealth.tenantId,
          band: tenantHealth.band,
          score: tenantHealth.score,
          riskReasons: tenantHealth.riskReasons,
          studentCount: tenantMetricsDaily.studentCount,
          staffCount: tenantMetricsDaily.staffCount,
          feesOutstandingPaise: tenantMetricsDaily.feesOutstandingPaise,
          smsCostPaise: tenantMetricsDaily.smsCostPaise,
          day: tenantMetricsDaily.day,
          tenantName: tenants.name,
          planTier: tenants.planTier,
          status: tenants.status,
          activatedAt: tenants.activatedAt,
        })
        .from(tenantHealth)
        .innerJoin(tenants, eq(tenants.id, tenantHealth.tenantId))
        .leftJoin(
          tenantMetricsDaily,
          and(
            eq(tenantMetricsDaily.tenantId, tenantHealth.tenantId),
            eq(
              tenantMetricsDaily.day,
              sql`(select max(d.day) from tenant_metrics_daily d where d.tenant_id = ${tenantHealth.tenantId})`,
            ),
          ),
        );

      const byBand: Record<string, number> = {};
      let students = 0;
      let staff = 0;
      let smsCostPaise = 0;
      for (const r of rows) {
        byBand[r.band] = (byBand[r.band] ?? 0) + 1;
        students += r.studentCount ?? 0;
        staff += r.staffCount ?? 0;
        smsCostPaise += r.smsCostPaise ?? 0;
      }

      return {
        schools: rows.length,
        byBand,
        totals: { students, staff, smsCostPaise },
        alerts: rows
          .filter((r) => r.band === 'at_risk' || r.band === 'churning')
          .slice(0, 20)
          .map((r) => ({
            tenantId: r.tenantId,
            name: r.tenantName,
            band: r.band,
            score: r.score,
            riskReasons: r.riskReasons,
          })),
      };
    });
  }

  /**
   * Daily count of schools that did something, for the fleet chart.
   *
   * One GROUP BY over tenant_metrics_daily, which is already pre-aggregated and
   * indexed on day — no new rollup and no per-tenant loop. The generate_series
   * left join is what makes the result dense: a day on which nobody was active
   * has to come back as a zero, or the chart silently draws a straight line
   * between the days either side of it and invents activity that never happened.
   *
   * "Active" is ACTIVITY_COLUMNS — the same six module signals the health
   * scorer counts for adoption.
   */
  async fleetSeries(days: number) {
    const activeExpr = sql.raw(
      ACTIVITY_COLUMNS.map((c) => `m.${c} > 0`).join(' or '),
    );

    return this.db.run(async (tx) => {
      const rows = await tx.execute(sql`
        select
          d.day::date::text as day,
          coalesce(count(distinct m.tenant_id), 0)::int as active_schools
        from generate_series(
          (current_date - make_interval(days => ${days - 1}))::date,
          current_date,
          interval '1 day'
        ) as d(day)
        left join tenant_metrics_daily m
          on m.day = d.day::date and (${activeExpr})
        group by d.day
        order by d.day
      `);

      return {
        days,
        definition: `A school counts as active on a day if any of: ${ACTIVITY_COLUMNS.join(', ')} is greater than zero.`,
        data: (rows as unknown as Array<{ day: string; active_schools: number }>).map(
          (r) => ({ day: r.day, activeSchools: Number(r.active_schools) }),
        ),
      };
    });
  }

  async schools(query: SchoolsQuery) {
    return this.db.run(async (tx) => {
      const rows = await tx
        .select({
          id: tenants.id,
          name: tenants.name,
          slug: tenants.slug,
          planTier: tenants.planTier,
          status: tenants.status,
          band: tenantHealth.band,
          score: tenantHealth.score,
          studentCount: tenantMetricsDaily.studentCount,
          lastActivityDay: tenantMetricsDaily.day,
          riskReasons: tenantHealth.riskReasons,
        })
        .from(tenants)
        .leftJoin(tenantHealth, eq(tenantHealth.tenantId, tenants.id))
        .leftJoin(
          tenantMetricsDaily,
          and(
            eq(tenantMetricsDaily.tenantId, tenants.id),
            eq(
              tenantMetricsDaily.day,
              sql`(select max(d.day) from tenant_metrics_daily d where d.tenant_id = ${tenants.id})`,
            ),
          ),
        )
        .where(
          and(
            eq(tenants.isActive, true),
            query.band ? eq(tenantHealth.band, query.band as never) : undefined,
            query.q
              ? sql`${tenants.name} ilike ${'%' + query.q + '%'}`
              : undefined,
          ),
        )
        .orderBy(desc(tenantHealth.score))
        .limit(200);

      return { data: rows };
    });
  }

  async schoolDetail(tenantId: string) {
    return this.db.run(async (tx) => {
      const [tenant] = await tx
        .select({
          id: tenants.id,
          name: tenants.name,
          slug: tenants.slug,
          status: tenants.status,
          planTier: tenants.planTier,
          onboardingStep: tenants.onboardingStep,
          onboardingCompletedAt: tenants.onboardingCompletedAt,
          activatedAt: tenants.activatedAt,
          createdAt: tenants.createdAt,
        })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      if (!tenant) throw new ApiException(404, 'NOT_FOUND', 'School not found');

      const [health] = await tx
        .select({
          band: tenantHealth.band,
          score: tenantHealth.score,
          activationScore: tenantHealth.activationScore,
          engagementScore: tenantHealth.engagementScore,
          adoptionScore: tenantHealth.adoptionScore,
          riskReasons: tenantHealth.riskReasons,
          daysSinceLastAttendance: tenantHealth.daysSinceLastAttendance,
        })
        .from(tenantHealth)
        .where(eq(tenantHealth.tenantId, tenantId))
        .limit(1);

      const [metrics] = await tx
        .select({
          day: tenantMetricsDaily.day,
          studentCount: tenantMetricsDaily.studentCount,
          staffCount: tenantMetricsDaily.staffCount,
          guardianCount: tenantMetricsDaily.guardianCount,
          attendanceRegistersMarked: tenantMetricsDaily.attendanceRegistersMarked,
          attendanceRegistersExpected: tenantMetricsDaily.attendanceRegistersExpected,
          feesCollectedPaise: tenantMetricsDaily.feesCollectedPaise,
          feesOutstandingPaise: tenantMetricsDaily.feesOutstandingPaise,
          smsCostPaise: tenantMetricsDaily.smsCostPaise,
          storageBytes: tenantMetricsDaily.storageBytes,
          egressBytes: tenantMetricsDaily.egressBytes,
        })
        .from(tenantMetricsDaily)
        .where(eq(tenantMetricsDaily.tenantId, tenantId))
        .orderBy(desc(tenantMetricsDaily.day))
        .limit(1);

      const sessions = await tx
        .select({
          id: platformSupportSessions.id,
          reason: platformSupportSessions.reason,
          accessLevel: platformSupportSessions.accessLevel,
          startedAt: platformSupportSessions.startedAt,
          expiresAt: platformSupportSessions.expiresAt,
          endedAt: platformSupportSessions.endedAt,
          schoolNotifiedAt: platformSupportSessions.schoolNotifiedAt,
        })
        .from(platformSupportSessions)
        .where(eq(platformSupportSessions.tenantId, tenantId))
        .orderBy(desc(platformSupportSessions.startedAt))
        .limit(20);

      return { tenant, health: health ?? null, metrics: metrics ?? null, supportSessions: sessions, billing: await this.billingForTenant(tx, tenantId) };
    });
  }

  async schoolMetrics(tenantId: string, query: MetricsRangeQuery) {
    const from = query.from ?? addDays(new Date().toISOString().slice(0, 10), -30);
    const to = query.to ?? new Date().toISOString().slice(0, 10);

    return this.db.run(async (tx) => {
      const rows = await tx
        .select({
          day: tenantMetricsDaily.day,
          studentCount: tenantMetricsDaily.studentCount,
          attendanceRegistersMarked: tenantMetricsDaily.attendanceRegistersMarked,
          attendanceRegistersExpected: tenantMetricsDaily.attendanceRegistersExpected,
          homeworkPosted: tenantMetricsDaily.homeworkPosted,
          feesCollectedPaise: tenantMetricsDaily.feesCollectedPaise,
          dauStaff: tenantMetricsDaily.dauStaff,
          dauParents: tenantMetricsDaily.dauParents,
        })
        .from(tenantMetricsDaily)
        .where(
          and(
            eq(tenantMetricsDaily.tenantId, tenantId),
            gte(tenantMetricsDaily.day, from),
            lte(tenantMetricsDaily.day, to),
          ),
        )
        .orderBy(tenantMetricsDaily.day);
      return { from, to, data: rows };
    });
  }

  async funnel() {
    return this.db.run(async (tx) => {
      const rows = await tx
        .select({
          step: onboardingEvents.step,
          action: onboardingEvents.action,
          count: sql<number>`count(*)::int`,
          medianDurationSeconds: sql<number>`percentile_cont(0.5) within group (order by ${onboardingEvents.durationSeconds})`,
        })
        .from(onboardingEvents)
        .groupBy(onboardingEvents.step, onboardingEvents.action)
        .orderBy(onboardingEvents.step);

      return { data: rows };
    });
  }

  async revenue() {
    return this.db.run(async (tx) => {
      const rows = await tx
        .select({
          status: subscriptions.status,
          amountPaise: subscriptions.amountPaise,
          billedStudentCount: subscriptions.billedStudentCount,
          planCode: plans.code,
          planTier: plans.tier,
        })
        .from(subscriptions)
        .innerJoin(plans, eq(plans.id, subscriptions.planId))
        .where(sql`${subscriptions.status} in ('trial','active','past_due')`);

      const mrrPaise = rows
        .filter((r) => r.status === 'active' || r.status === 'past_due')
        .reduce((s, r) => s + Math.round(Number(r.amountPaise) / 12), 0);

      return {
        mrrPaise,
        arrPaise: mrrPaise * 12,
        activeSubscriptions: rows.filter((r) => r.status === 'active').length,
        trialSubscriptions: rows.filter((r) => r.status === 'trial').length,
        byPlan: rows,
      };
    });
  }

  async costToServe() {
    return this.db.run(async (tx) => {
      const rows = await tx
        .select({
          tenantId: tenantMetricsDaily.tenantId,
          name: tenants.name,
          smsCostPaise: sql<number>`sum(${tenantMetricsDaily.smsCostPaise})::bigint`,
          storageBytes: sql<number>`max(${tenantMetricsDaily.storageBytes})::bigint`,
          egressBytes: sql<number>`sum(${tenantMetricsDaily.egressBytes})::bigint`,
        })
        .from(tenantMetricsDaily)
        .innerJoin(tenants, eq(tenants.id, tenantMetricsDaily.tenantId))
        .where(sql`${tenantMetricsDaily.day} >= current_date - 30`)
        .groupBy(tenantMetricsDaily.tenantId, tenants.name)
        .orderBy(sql`sum(${tenantMetricsDaily.smsCostPaise}) desc`)
        .limit(100);

      return { data: rows, windowDays: 30 };
    });
  }

  async alerts() {
    return this.db.run(async (tx) => {
      const rows = await tx
        .select({
          tenantId: tenantHealth.tenantId,
          name: tenants.name,
          band: tenantHealth.band,
          score: tenantHealth.score,
          riskReasons: tenantHealth.riskReasons,
          snoozedUntil: tenantHealth.snoozedUntil,
        })
        .from(tenantHealth)
        .innerJoin(tenants, eq(tenants.id, tenantHealth.tenantId))
        .where(
          and(
            sql`${tenantHealth.band} in ('at_risk','churning','dormant')`,
            sql`(${tenantHealth.snoozedUntil} is null or ${tenantHealth.snoozedUntil} < now())`,
          ),
        )
        .orderBy(tenantHealth.score)
        .limit(50);
      return { data: rows };
    });
  }

  async createAnnouncement(dto: CreateAnnouncementDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [row] = await tx
        .insert(platformAnnouncements)
        .values({
          title: dto.title,
          body: dto.body,
          kind: dto.kind ?? 'release',
          targetPlanCodes: dto.targetPlanCodes ?? [],
          targetHealthBands: dto.targetHealthBands ?? [],
          targetTenantIds: dto.targetTenantIds ?? [],
          isBlocking: dto.isBlocking ?? false,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({
          id: platformAnnouncements.id,
          title: platformAnnouncements.title,
        });
      return row;
    });
  }

  async listReferrals() {
    return this.db.run(async (tx) => {
      const rows = await tx
        .select({
          id: referrals.id,
          code: referrals.code,
          status: referrals.status,
          referrerTenantId: referrals.referrerTenantId,
          referredTenantId: referrals.referredTenantId,
          activatedAt: referrals.activatedAt,
          rewardGrantedAt: referrals.rewardGrantedAt,
          invitedSchoolName: referrals.invitedSchoolName,
        })
        .from(referrals)
        .orderBy(desc(referrals.createdAt))
        .limit(200);
      return { data: rows };
    });
  }

  async listPartners() {
    return this.db.run(async (tx) => {
      const rows = await tx
        .select({
          id: partners.id,
          name: partners.name,
          city: partners.city,
          state: partners.state,
          commissionBp: partners.commissionBp,
          referralCode: partners.referralCode,
          isActive: partners.isActive,
        })
        .from(partners)
        .where(eq(partners.isActive, true))
        .orderBy(partners.name);
      return { data: rows };
    });
  }

  async createSupportSession(dto: CreateSupportSessionDto) {
    const ctx = RequestContextStore.get();
    if (!ctx.userId) {
      throw new ApiException(401, 'UNAUTHENTICATED', 'Not signed in');
    }
    if (dto.reason.trim().length < 20) {
      throw new ApiException(
        422,
        'REASON_TOO_SHORT',
        'Support session reason must be at least 20 characters. "debug" is not a reason.',
      );
    }

    const minutes = Math.min(dto.durationMinutes ?? 60, 240);
    const accessLevel = dto.accessLevel ?? 'read_only';

    if (accessLevel === 'read_write') {
      throw new ApiException(
        422,
        'SUPERVISOR_REQUIRED',
        'Write access requires approvedBySupervisorId. Request supervisor approval first.',
      );
    }

    const expiresAt = new Date(Date.now() + minutes * 60 * 1000);
    const now = new Date();

    const session = await this.db.run(async (tx) => {
      const [row] = await tx
        .insert(platformSupportSessions)
        .values({
          tenantId: dto.tenantId,
          agentUserId: ctx.userId!,
          impersonatedUserId: dto.impersonatedUserId,
          reason: dto.reason.trim(),
          ticketRef: dto.ticketRef,
          accessLevel,
          requiresSchoolApproval: dto.requiresSchoolApproval ?? false,
          schoolNotifiedAt: now,
          startedAt: now,
          expiresAt,
        })
        .returning({
          id: platformSupportSessions.id,
          tenantId: platformSupportSessions.tenantId,
          accessLevel: platformSupportSessions.accessLevel,
          expiresAt: platformSupportSessions.expiresAt,
          schoolNotifiedAt: platformSupportSessions.schoolNotifiedAt,
          reason: platformSupportSessions.reason,
        });
      return row!;
    });

    this.logger.warn(
      `SUPPORT SESSION started id=${session.id} tenant=${session.tenantId} ` +
        `agent=${ctx.userId} expires=${session.expiresAt.toISOString()}`,
    );

    RequestContextStore.addAudit({
      action: 'platform.support_session.start',
      entityType: 'platform_support_sessions',
      entityId: session.id,
    });

    // School-visible: notify the school that support is in their tenant.
    void this.notifications
      .notify({
        tenantId: dto.tenantId,
        templateCode: 'platform.support_session',
        recipients: [{ userId: ctx.userId }],
        variables: {
          reason: dto.reason.slice(0, 120),
          expiresAt: expiresAt.toISOString(),
        },
        priority: 'high',
        channels: ['in_app'],
      })
      .catch((err: unknown) => {
        // The session is granted either way; this notice is how the school
        // learns one of us opened it, so losing it silently matters.
        this.logger.error(
          `Support-session notice failed for tenant=${dto.tenantId}: ` +
            (err instanceof Error ? err.message : String(err)),
        );
      });

    return session;
  }

  /** School-facing: list support sessions against this tenant (audit view). */
  async schoolVisibleSupportSessions(tenantId: string) {
    return this.db.asTenant(tenantId, async (tx) => {
      const rows = await tx
        .select({
          id: platformSupportSessions.id,
          reason: platformSupportSessions.reason,
          ticketRef: platformSupportSessions.ticketRef,
          accessLevel: platformSupportSessions.accessLevel,
          startedAt: platformSupportSessions.startedAt,
          expiresAt: platformSupportSessions.expiresAt,
          endedAt: platformSupportSessions.endedAt,
          schoolNotifiedAt: platformSupportSessions.schoolNotifiedAt,
          actionCount: platformSupportSessions.actionCount,
        })
        .from(platformSupportSessions)
        .where(eq(platformSupportSessions.tenantId, tenantId))
        .orderBy(desc(platformSupportSessions.startedAt))
        .limit(50);
      return { data: rows };
    });
  }

  async listOpenSupportSessions() {
    return this.db.run(async (tx) => {
      const rows = await tx
        .select({
          id: platformSupportSessions.id,
          tenantId: platformSupportSessions.tenantId,
          tenantName: tenants.name,
          reason: platformSupportSessions.reason,
          ticketRef: platformSupportSessions.ticketRef,
          accessLevel: platformSupportSessions.accessLevel,
          startedAt: platformSupportSessions.startedAt,
          expiresAt: platformSupportSessions.expiresAt,
          agentUserId: platformSupportSessions.agentUserId,
        })
        .from(platformSupportSessions)
        .innerJoin(tenants, eq(tenants.id, platformSupportSessions.tenantId))
        .where(
          and(
            sql`${platformSupportSessions.endedAt} is null`,
            sql`${platformSupportSessions.expiresAt} > now()`,
          ),
        )
        .orderBy(desc(platformSupportSessions.startedAt))
        .limit(100);
      return { data: rows };
    });
  }

  /**
   * Counts and rupee totals only. Never a student name.
   */
  private async billingForTenant(tx: Parameters<Parameters<TenantDbService['run']>[0]>[0], tenantId: string) {
    const [session] = await tx
      .select({
        id: academicSessions.id,
        name: academicSessions.name,
        endDate: academicSessions.endDate,
      })
      .from(academicSessions)
      .where(and(eq(academicSessions.tenantId, tenantId), eq(academicSessions.isCurrent, true)))
      .limit(1);

    const empty = {
      sessionName: session?.name ?? null,
      manual: { count: 0, billedCount: 0, unbilledCount: 0, owedPaise: 0, unbilledPaise: 0 },
      play: { count: 0 },
      complimentary: { count: 0 },
      stayConnected: null as null | {
        status: string;
        totalPaise: number;
        dueDate: string;
        paidAt: string | null;
        invoiceNumber: string | null;
      },
      invoices: [] as Array<{
        id: string;
        invoiceNumber: string;
        kind: string;
        totalPaise: number;
        issuedAt: string;
        status: string;
      }>,
    };

    if (!session) return empty;

    await ensureStayConnectedFee(tx, {
      tenantId,
      academicSessionId: session.id,
      sessionName: session.name,
      sessionEndDate: session.endDate,
      userId: null,
    });

    const bySource = await tx
      .select({
        source: studentSubscriptions.source,
        count: sql<number>`count(*)::int`,
        billed: sql<number>`count(*) filter (where ${studentSubscriptions.billedToSchoolAt} is not null)::int`,
      })
      .from(studentSubscriptions)
      .where(
        and(
          eq(studentSubscriptions.tenantId, tenantId),
          eq(studentSubscriptions.academicSessionId, session.id),
          eq(studentSubscriptions.status, 'active'),
        ),
      )
      .groupBy(studentSubscriptions.source);

    const manual = bySource.find((r) => r.source === 'manual_cash');
    const play = bySource.find((r) => r.source === 'google_play');
    const complimentary = bySource.find((r) => r.source === 'complimentary');
    const manualCount = Number(manual?.count ?? 0);
    const billedCount = Number(manual?.billed ?? 0);
    const unbilledCount = manualCount - billedCount;

    const [fee] = await tx
      .select({
        status: stayConnectedFees.status,
        totalPaise: stayConnectedFees.totalPaise,
        dueDate: stayConnectedFees.dueDate,
        paidAt: stayConnectedFees.paidAt,
        invoiceNumber: stayConnectedFees.invoiceNumber,
      })
      .from(stayConnectedFees)
      .where(
        and(
          eq(stayConnectedFees.tenantId, tenantId),
          eq(stayConnectedFees.academicSessionId, session.id),
        ),
      )
      .limit(1);

    const invoices = await tx
      .select({
        id: platformInvoices.id,
        invoiceNumber: platformInvoices.invoiceNumber,
        kind: platformInvoices.kind,
        totalPaise: platformInvoices.totalPaise,
        issuedAt: platformInvoices.issuedAt,
        status: platformInvoices.status,
      })
      .from(platformInvoices)
      .where(eq(platformInvoices.tenantId, tenantId))
      .orderBy(desc(platformInvoices.issuedAt))
      .limit(20);

    return {
      sessionName: session.name,
      manual: {
        count: manualCount,
        billedCount,
        unbilledCount,
        owedPaise: manualCount * PARENT_SUBSCRIPTION_TOTAL_PAISE,
        unbilledPaise: unbilledCount * PARENT_SUBSCRIPTION_TOTAL_PAISE,
      },
      play: { count: Number(play?.count ?? 0) },
      complimentary: { count: Number(complimentary?.count ?? 0) },
      stayConnected: fee
        ? {
            status: fee.status,
            totalPaise: fee.totalPaise,
            dueDate: fee.dueDate.toISOString(),
            paidAt: fee.paidAt?.toISOString() ?? null,
            invoiceNumber: fee.invoiceNumber,
          }
        : null,
      invoices: invoices.map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        kind: i.kind,
        totalPaise: i.totalPaise,
        issuedAt: i.issuedAt.toISOString(),
        status: i.status,
      })),
    };
  }

  async suspendTenant(tenantId: string, reason: string) {
    return this.db.run(async (tx) => {
      const [row] = await tx
        .select({ id: tenants.id, status: tenants.status, name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      if (!row) throw new ApiException(404, 'NOT_FOUND', 'School not found');
      if (row.status === 'suspended') {
        throw new ApiException(409, 'ALREADY_SUSPENDED', 'This school is already suspended.');
      }
      await tx
        .update(tenants)
        .set({ status: 'suspended', updatedAt: new Date() })
        .where(eq(tenants.id, tenantId));
      RequestContextStore.addAudit({
        action: 'tenant.suspend',
        entityType: 'tenants',
        entityId: tenantId,
        changes: { status: { from: row.status, to: 'suspended' }, reason: { from: null, to: reason } },
      });
      return { id: tenantId, status: 'suspended' as const, reason };
    });
  }

  async unsuspendTenant(tenantId: string, reason: string) {
    return this.db.run(async (tx) => {
      const [row] = await tx
        .select({ id: tenants.id, status: tenants.status })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      if (!row) throw new ApiException(404, 'NOT_FOUND', 'School not found');
      if (row.status !== 'suspended') {
        throw new ApiException(409, 'NOT_SUSPENDED', 'This school is not suspended.');
      }
      await tx
        .update(tenants)
        .set({ status: 'active', updatedAt: new Date() })
        .where(eq(tenants.id, tenantId));
      RequestContextStore.addAudit({
        action: 'tenant.unsuspend',
        entityType: 'tenants',
        entityId: tenantId,
        changes: { status: { from: 'suspended', to: 'active' }, reason: { from: null, to: reason } },
      });
      return { id: tenantId, status: 'active' as const, reason };
    });
  }

  async markStayConnectedPaid(tenantId: string) {
    return this.db.run(async (tx) => {
      const [session] = await tx
        .select({ id: academicSessions.id })
        .from(academicSessions)
        .where(and(eq(academicSessions.tenantId, tenantId), eq(academicSessions.isCurrent, true)))
        .limit(1);
      if (!session) {
        throw new ApiException(422, 'NO_SESSION', 'This school has no current academic session.');
      }
      const [fee] = await tx
        .update(stayConnectedFees)
        .set({ status: 'paid', paidAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(stayConnectedFees.tenantId, tenantId),
            eq(stayConnectedFees.academicSessionId, session.id),
          ),
        )
        .returning({ id: stayConnectedFees.id, status: stayConnectedFees.status });
      if (!fee) {
        throw new ApiException(404, 'NOT_FOUND', 'No Stay Connected Fee row for the current session.');
      }
      RequestContextStore.addAudit({
        action: 'stay_connected.mark_paid',
        entityType: 'stay_connected_fees',
        entityId: fee.id,
      });
      return fee;
    });
  }
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

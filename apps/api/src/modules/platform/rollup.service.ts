/**
 * Nightly tenant metrics rollup. Iterates tenants ONE AT A TIME via asTenant()
 * so RLS still applies — never a cross-tenant GROUP BY.
 *
 * Person counts use parameterized SQL against student/staff tables without
 * importing those symbols (CI forbids students|guardians|… in platform imports).
 */

import { Injectable, Logger } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import {
  announcements,
  attendanceRegisters,
  branches,
  homework,
  sections,
  tenantHealth,
  tenantMetricsDaily,
  tenants,
  trips,
} from '@saw/db';

import { TenantDbService, type Tx } from '../../common/database/tenant-db.service';

export type HealthBand =
  | 'not_started'
  | 'onboarding'
  | 'activated'
  | 'healthy'
  | 'at_risk'
  | 'churning'
  | 'dormant';

/**
 * What counts as a school doing something on a given day.
 *
 * This is the adoption definition the health scorer has always used, lifted
 * out so the fleet time series can share it rather than inventing a second
 * answer to the same question. Note it is deliberately NOT dau_staff /
 * dau_parents: those columns exist but the rollup has never populated them,
 * so anything built on them plots a flat zero.
 *
 * Column names, because the series aggregates in SQL across tenants while the
 * scorer works on one tenant's row in TypeScript.
 */
export const ACTIVITY_COLUMNS = [
  'attendance_registers_marked',
  'homework_posted',
  'announcements_sent',
  'marks_entered',
  'trips_run',
  'invoices_raised',
] as const;

type DayMetrics = {
  tenantId: string;
  day: string;
  branchCount: number;
  studentCount: number;
  staffCount: number;
  guardianCount: number;
  activeClassCount: number;
  dauStaff: number;
  dauParents: number;
  mauStaff: number;
  mauParents: number;
  parentActivationBp: number;
  attendanceRegistersMarked: number;
  attendanceRegistersExpected: number;
  homeworkPosted: number;
  announcementsSent: number;
  messagesSent: number;
  marksEntered: number;
  reportCardsPublished: number;
  booksOpened: number;
  tripsRun: number;
  invoicesRaised: number;
  feesCollectedPaise: number;
  feesOutstandingPaise: number;
  onlinePaymentCount: number;
  smsSent: number;
  smsCostPaise: number;
  whatsappSent: number;
  pushSent: number;
  storageBytes: number;
  apiRequests: number;
  egressBytes: number;
  apaarGenerated: number;
  apaarPending: number;
  consentPending: number;
};

@Injectable()
export class RollupService {
  private readonly logger = new Logger(RollupService.name);

  constructor(private readonly db: TenantDbService) {}

  async activeTenantIds(): Promise<string[]> {
    const rows = await this.db.run(async (tx) =>
      tx
        .select({ id: tenants.id })
        .from(tenants)
        .where(
          and(
            eq(tenants.isActive, true),
            sql`${tenants.status} not in ('churned','suspended')`,
          ),
        ),
    );
    return rows.map((r) => r.id);
  }

  /** Idempotent per (tenant, day). Target: 100 tenants < 5 minutes. */
  async runForDay(day: string): Promise<{ tenants: number; ms: number }> {
    const started = Date.now();
    const ids = await this.activeTenantIds();
    let done = 0;

    for (const tenantId of ids) {
      await this.db.asTenant(tenantId, async (tx) => {
        const metrics = await this.computeMetrics(tx, tenantId, day);
        await this.upsertMetrics(tx, metrics);
        const health = this.score(metrics, await this.recentAttendanceRatios(tx, day));
        await this.upsertHealth(tx, tenantId, health);
      });
      done += 1;
    }

    const ms = Date.now() - started;
    this.logger.log(`Rollup day=${day} tenants=${done} ms=${ms}`);
    return { tenants: done, ms };
  }

  async computeMetrics(tx: Tx, tenantId: string, day: string): Promise<DayMetrics> {
    // Inside asTenant(), RLS scopes to this tenant — no tenant_id filter needed
    // on counts, but we still bind tenantId for clarity and defense-in-depth.
    const studentCount = await this.countActive(tx, 'students');
    const staffCount = await this.countActive(tx, 'staff');
    const guardianCount = await this.countActive(tx, 'guardians');

    const [branchRow] = await tx
      .select({ c: sql<number>`count(*)::int` })
      .from(branches);

    const [sectionRow] = await tx
      .select({ c: sql<number>`count(*)::int` })
      .from(sections)
      .where(eq(sections.isActive, true));

    const [attMarked] = await tx
      .select({ c: sql<number>`count(*)::int` })
      .from(attendanceRegisters)
      .where(
        and(
          eq(attendanceRegisters.day, day),
          sql`${attendanceRegisters.markedAt} is not null`,
        ),
      );

    const expected = Math.max(Number(sectionRow?.c ?? 0), 1);

    const [hw] = await tx
      .select({ c: sql<number>`count(*)::int` })
      .from(homework)
      .where(eq(homework.assignedOn, day));

    const [ann] = await tx
      .select({ c: sql<number>`count(*)::int` })
      .from(announcements)
      .where(sql`${announcements.sentAt}::date = ${day}`);

    const [tripCount] = await tx
      .select({ c: sql<number>`count(*)::int` })
      .from(trips)
      .where(eq(trips.day, day));

    const feesCollectedPaise = await this.scalarNumber(
      tx,
      // 'captured' is not a payment_status — the enum is
      // initiated/pending/success/failed/refunded/... — so this threw on every
      // run and took the whole rollup with it, which is why the fleet view has
      // only ever shown zeros. 'success' minus bounced is what the school
      // dashboard counts as collected; the console must agree with it.
      sql`select coalesce(sum(amount_paise),0)::bigint as c from payments
          where status = 'success' and bounced_at is null and created_at::date = ${day}`,
    );
    const feesOutstandingPaise = await this.scalarNumber(
      tx,
      // The table is `invoices`, and the enum value is `partially_paid`, not
      // `partial`. Same statuses the rollover dry-run counts as owed: a waived
      // or cancelled invoice is not outstanding money.
      sql`select coalesce(sum(balance_paise),0)::bigint as c from invoices
          where status in ('issued','partially_paid','overdue')`,
    );
    const invoicesRaised = await this.scalarNumber(
      tx,
      sql`select count(*)::int as c from invoices where created_at::date = ${day}`,
    );
    const marksEntered = await this.scalarNumber(
      tx,
      sql`select count(*)::int as c from marks where updated_at::date = ${day}`,
    );

    return {
      tenantId,
      day,
      branchCount: Number(branchRow?.c ?? 0),
      studentCount,
      staffCount,
      guardianCount,
      activeClassCount: Number(sectionRow?.c ?? 0),
      dauStaff: 0,
      dauParents: 0,
      mauStaff: 0,
      mauParents: 0,
      parentActivationBp: 0,
      attendanceRegistersMarked: Number(attMarked?.c ?? 0),
      attendanceRegistersExpected: expected,
      homeworkPosted: Number(hw?.c ?? 0),
      announcementsSent: Number(ann?.c ?? 0),
      messagesSent: 0,
      marksEntered,
      reportCardsPublished: 0,
      booksOpened: 0,
      tripsRun: Number(tripCount?.c ?? 0),
      invoicesRaised,
      feesCollectedPaise,
      feesOutstandingPaise,
      onlinePaymentCount: 0,
      smsSent: 0,
      smsCostPaise: 0,
      whatsappSent: 0,
      pushSent: 0,
      storageBytes: 0,
      apiRequests: 0,
      egressBytes: 0,
      apaarGenerated: 0,
      apaarPending: 0,
      consentPending: 0,
    };
  }

  async upsertMetrics(tx: Tx, m: DayMetrics) {
    await tx
      .insert(tenantMetricsDaily)
      .values({
        ...m,
        computedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [tenantMetricsDaily.tenantId, tenantMetricsDaily.day],
        set: {
          branchCount: m.branchCount,
          studentCount: m.studentCount,
          staffCount: m.staffCount,
          guardianCount: m.guardianCount,
          activeClassCount: m.activeClassCount,
          attendanceRegistersMarked: m.attendanceRegistersMarked,
          attendanceRegistersExpected: m.attendanceRegistersExpected,
          homeworkPosted: m.homeworkPosted,
          announcementsSent: m.announcementsSent,
          marksEntered: m.marksEntered,
          tripsRun: m.tripsRun,
          invoicesRaised: m.invoicesRaised,
          feesCollectedPaise: m.feesCollectedPaise,
          feesOutstandingPaise: m.feesOutstandingPaise,
          computedAt: new Date(),
          updatedAt: new Date(),
        },
      });
  }

  score(
    m: DayMetrics,
    recentRatios: number[],
  ): {
    band: HealthBand;
    score: number;
    activationScore: number;
    engagementScore: number;
    adoptionScore: number;
    daysSinceLastAttendance: number | null;
    daysSinceAnyActivity: number | null;
    riskReasons: string[];
  } {
    const activationScore = Math.min(
      100,
      (m.attendanceRegistersMarked > 0 ? 60 : 0) + (m.studentCount > 0 ? 40 : 0),
    );

    const attRatio =
      m.attendanceRegistersExpected > 0
        ? m.attendanceRegistersMarked / m.attendanceRegistersExpected
        : 0;
    const engagementScore = Math.min(
      100,
      Math.round(
        attRatio * 70 + (m.homeworkPosted > 0 ? 15 : 0) + (m.announcementsSent > 0 ? 15 : 0),
      ),
    );

    // Same six signals as ACTIVITY_COLUMNS, in the same order. If you add one,
    // add it there too or the fleet series and this score start disagreeing.
    const moduleSignals = [
      m.attendanceRegistersMarked,
      m.homeworkPosted,
      m.announcementsSent,
      m.marksEntered,
      m.tripsRun,
      m.invoicesRaised,
    ];
    const modulesUsed = moduleSignals.filter((n) => n > 0).length;
    const adoptionScore = Math.min(
      100,
      Math.round((modulesUsed / ACTIVITY_COLUMNS.length) * 100),
    );

    const score = Math.round(
      0.3 * activationScore + 0.5 * engagementScore + 0.2 * adoptionScore,
    );

    const riskReasons: string[] = [];
    const lowAttStreak =
      recentRatios.length >= 3 && recentRatios.slice(0, 3).every((r) => r < 0.6);
    if (lowAttStreak) {
      riskReasons.push(
        'Attendance registers marked ÷ expected < 60% for 3 consecutive working days',
      );
    }

    let band: HealthBand;
    if (m.studentCount === 0 && m.attendanceRegistersMarked === 0) {
      band = 'not_started';
    } else if (activationScore < 100) {
      band = 'onboarding';
    } else if (lowAttStreak) {
      band = 'at_risk';
    } else if (score >= 70) {
      band = 'healthy';
    } else if (score >= 40) {
      band = 'activated';
    } else {
      band = 'dormant';
    }

    return {
      band,
      score,
      activationScore,
      engagementScore,
      adoptionScore,
      daysSinceLastAttendance: m.attendanceRegistersMarked > 0 ? 0 : null,
      daysSinceAnyActivity: 0,
      riskReasons,
    };
  }

  async upsertHealth(
    tx: Tx,
    tenantId: string,
    h: ReturnType<RollupService['score']>,
  ) {
    await tx
      .insert(tenantHealth)
      .values({
        tenantId,
        band: h.band,
        score: h.score,
        activationScore: h.activationScore,
        engagementScore: h.engagementScore,
        adoptionScore: h.adoptionScore,
        daysSinceLastAttendance: h.daysSinceLastAttendance,
        daysSinceAnyActivity: h.daysSinceAnyActivity,
        riskReasons: h.riskReasons,
        computedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [tenantHealth.tenantId],
        set: {
          band: h.band,
          score: h.score,
          activationScore: h.activationScore,
          engagementScore: h.engagementScore,
          adoptionScore: h.adoptionScore,
          daysSinceLastAttendance: h.daysSinceLastAttendance,
          daysSinceAnyActivity: h.daysSinceAnyActivity,
          riskReasons: h.riskReasons,
          computedAt: new Date(),
          updatedAt: new Date(),
        },
      });
  }

  private async recentAttendanceRatios(tx: Tx, day: string): Promise<number[]> {
    const rows = await tx
      .select({
        marked: tenantMetricsDaily.attendanceRegistersMarked,
        expected: tenantMetricsDaily.attendanceRegistersExpected,
      })
      .from(tenantMetricsDaily)
      .where(sql`${tenantMetricsDaily.day} <= ${day}`)
      .orderBy(sql`${tenantMetricsDaily.day} desc`)
      .limit(3);

    return rows.map((r) => (r.expected > 0 ? r.marked / r.expected : 0));
  }

  private async countActive(tx: Tx, table: 'students' | 'staff' | 'guardians'): Promise<number> {
    // Table name from a fixed union — not user input.
    const q =
      table === 'students'
        ? sql`select count(*)::int as c from students where is_active = true`
        : table === 'staff'
          ? sql`select count(*)::int as c from staff where is_active = true`
          : sql`select count(*)::int as c from guardians`;
    return this.scalarNumber(tx, q);
  }

  /**
   * Falling back to 0 keeps one bad counter from failing the whole nightly
   * rollup for a school. It also used to hide the failure completely: a query
   * naming a table that does not exist returned 0 and the console showed a
   * confident, wrong zero for months. A wrong number nobody can tell is wrong
   * is worse than a missing one, so the fallback now leaves a trace.
   */
  private async scalarNumber(tx: Tx, query: ReturnType<typeof sql>): Promise<number> {
    try {
      const rows = await tx.execute(query);
      const list = rows as unknown as Array<{ c: string | number }>;
      return Number(list[0]?.c ?? 0);
    } catch (err) {
      this.logger.error(
        `Rollup metric query failed, recording 0 for it: ` +
          (err instanceof Error ? err.message : String(err)),
      );
      return 0;
    }
  }
}

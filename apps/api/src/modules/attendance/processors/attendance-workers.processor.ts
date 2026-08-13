/**
 * Consumers for the two attendance queues, and the nightly summary recompute.
 *
 * `build/03-attendance.md` specifies both. Neither was running: absentee alerts
 * were enqueued to a queue nothing read, and the summary processor — which the
 * parent home screen and the student list both read from — was never called by
 * anything, so `attendance_summaries` stayed empty.
 */

import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { academicSessions, studentEnrollments, tenants } from '@saw/db';

import { RequestContextStore } from '../../../common/context/request-context';
import { TenantDbService } from '../../../common/database/tenant-db.service';
import { REDIS_CLIENT } from '../../../common/redis/redis.constants';
import { ATTENDANCE_ALERTS_QUEUE } from '../attendance-queue.service';
import { AbsenteeAlertProcessor } from './absentee-alert.processor';
import { AttendanceSummaryProcessor } from './attendance-summary.processor';

interface AbsenteeAlertJob {
  tenantId: string;
  registerId: string;
  day: string;
  studentIds: string[];
}

@Injectable()
export class AttendanceWorkersProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AttendanceWorkersProcessor.name);
  private alertsWorker: Worker | null = null;
  private timer: NodeJS.Timeout | null = null;
  private lastRunDay: string | null = null;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly db: TenantDbService,
    private readonly alerts: AbsenteeAlertProcessor,
    private readonly summaries: AttendanceSummaryProcessor,
  ) {}

  onModuleInit(): void {
    try {
      this.alertsWorker = new Worker<AbsenteeAlertJob>(
        ATTENDANCE_ALERTS_QUEUE,
        async (job: Job<AbsenteeAlertJob>) => {
          await this.alerts.process(job.data);
          this.logger.log(
            `Absentee alerts ${job.id}: register=${job.data.registerId} ` +
              `students=${job.data.studentIds.length}`,
          );
        },
        {
          connection: this.redis.duplicate({ maxRetriesPerRequest: null }),
          concurrency: 2,
        },
      );
      this.alertsWorker.on('failed', (job, err) => {
        this.logger.error(`Absentee alert job ${job?.id} failed: ${err.message}`);
      });
    } catch (err) {
      this.logger.warn(
        `Absentee alert worker not started: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    this.timer = setInterval(() => {
      void this.tick().catch((err) =>
        this.logger.error(
          `Attendance summary tick failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }, 60_000);
    this.timer.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.alertsWorker?.close();
  }

  /** 02:00 IST, after the platform rollup at 01:30 and before the school day. */
  private async tick(): Promise<void> {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const hour = Number(get('hour'));
    const minute = Number(get('minute'));
    const day = `${get('year')}-${get('month')}-${get('day')}`;

    if (hour !== 2 || minute > 5) return;
    if (this.lastRunDay === day) return;
    this.lastRunDay = day;

    await RequestContextStore.run(
      {
        requestId: `attendance-summary-${day}`,
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
      () => this.recomputeAll(),
    );
  }

  async recomputeAll(): Promise<{ tenants: number; students: number }> {
    // db.run, not runUnscoped: `tenants` is tenant-scoped under RLS and an
    // unscoped read returns nothing. The caller supplies platform-admin
    // context — the 02:00 tick below, or the platform-only controller.
    const activeTenants = await this.db.run((tx) =>
      tx
        .select({ id: tenants.id })
        .from(tenants)
        .where(and(eq(tenants.isActive, true), sql`${tenants.deletedAt} is null`)),
    );

    let students = 0;
    for (const tenant of activeTenants) {
      students += await this.recomputeTenant(tenant.id);
    }

    this.logger.log(
      `Attendance summaries recomputed: tenants=${activeTenants.length} students=${students}`,
    );
    return { tenants: activeTenants.length, students };
  }

  private async recomputeTenant(tenantId: string): Promise<number> {
    const sessions = await this.db.asTenant(tenantId, (tx) =>
      tx
        .select({ id: academicSessions.id })
        .from(academicSessions)
        .where(
          and(
            eq(academicSessions.tenantId, tenantId),
            eq(academicSessions.isCurrent, true),
          ),
        ),
    );

    let total = 0;
    for (const session of sessions) {
      const enrolled = await this.db.asTenant(tenantId, (tx) =>
        tx
          .selectDistinct({ studentId: studentEnrollments.studentId })
          .from(studentEnrollments)
          .where(
            and(
              eq(studentEnrollments.tenantId, tenantId),
              eq(studentEnrollments.academicSessionId, session.id),
              inArray(studentEnrollments.status, ['active', 'admitted']),
            ),
          ),
      );
      if (enrolled.length === 0) continue;

      await this.summaries.recomputeSession(
        tenantId,
        session.id,
        enrolled.map((e) => e.studentId),
      );
      total += enrolled.length;
    }
    return total;
  }
}

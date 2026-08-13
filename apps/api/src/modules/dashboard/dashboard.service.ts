import { Injectable } from '@nestjs/common';

import { RequestContextStore } from '../../common/context/request-context';
import { TenantDbService } from '../../common/database/tenant-db.service';
import { ApiException } from '../../common/errors/api.exception';
import { DashboardRepository } from './dashboard.repository';
import type {
  CollectionPointDto,
  PrincipalDashboardDto,
} from './dto/dashboard.response';

/** Enough to read a trend without turning the tile into a chart. */
const SPARKLINE_DAYS = 14;
/** The banner names a few and links out; it is not the attendance screen. */
const UNMARKED_PREVIEW = 6;
const INCIDENT_PREVIEW = 5;

@Injectable()
export class DashboardService {
  constructor(
    private readonly db: TenantDbService,
    private readonly repo: DashboardRepository,
  ) {}

  async principal(
    day: string | undefined,
    branchId: string | undefined,
  ): Promise<PrincipalDashboardDto> {
    const ctx = RequestContextStore.get();
    const branch = branchId ?? ctx.branchId;
    if (!branch) {
      throw new ApiException(
        400,
        'BAD_REQUEST',
        'Choose a branch before opening the dashboard.',
      );
    }

    const today = day ?? istToday();
    const from = addDays(today, -(SPARKLINE_DAYS - 1));

    return this.db.run(async (tx) => {
      const academicSessionId = await this.repo.currentSessionId(tx, branch);

      // Independent aggregates, so pay for one round trip rather than six.
      const [attendance, staffDay, staffTotal, collections, approvals, incidents] =
        await Promise.all([
          this.repo.attendanceToday(tx, branch, today),
          this.repo.staffToday(tx, branch, today),
          this.repo.activeStaffCount(tx, branch),
          this.repo.collections(tx, branch, from, today),
          this.repo.pendingApprovals(tx, branch),
          this.repo.openIncidents(tx, branch, INCIDENT_PREVIEW),
        ]);

      const totalSections = academicSessionId
        ? await this.repo.sectionCount(tx, branch, academicSessionId)
        : 0;

      const unmarked =
        academicSessionId && totalSections > attendance.markedSections
          ? await this.repo.unmarkedSections(
              tx,
              branch,
              academicSessionId,
              today,
              UNMARKED_PREVIEW,
            )
          : [];

      const series = fillDays(from, today, collections);
      const approvalTotal =
        approvals.staffLeave +
        approvals.studentLeave +
        approvals.feeConcession +
        approvals.circular;

      return {
        day: today,
        academicSessionId,
        attendance: {
          present: attendance.present,
          total: attendance.total,
          percentageBp:
            attendance.total > 0
              ? Math.round((attendance.present / attendance.total) * 10_000)
              : 0,
          markedSections: attendance.markedSections,
          totalSections,
        },
        staff: {
          present: staffDay.present,
          total: staffTotal,
          marked: staffDay.marked,
        },
        collections: {
          todayPaise: series.at(-1)?.amountPaise ?? 0,
          series,
        },
        openItems: {
          total: approvalTotal + incidents.length,
          approvals,
          incidents: incidents.length,
        },
        unmarkedSections: unmarked.map((s) => ({
          sectionId: s.sectionId,
          sectionLabel: `${s.className}-${s.sectionName}`,
          classTeacherName:
            [s.teacherFirstName, s.teacherLastName].filter(Boolean).join(' ') || null,
        })),
        incidents: incidents.map((i) => ({
          id: i.id,
          title: i.title,
          category: i.category,
          severity: i.severity,
          occurredAt: i.occurredAt?.toISOString() ?? null,
        })),
      };
    });
  }
}

/**
 * The school day is an Indian calendar date. Deriving it from the server clock
 * would put a container running UTC five and a half hours behind, showing
 * yesterday's register all evening.
 */
function istToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function addDays(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + delta));
  return dt.toISOString().slice(0, 10);
}

/** A day with no takings is a zero on the chart, not a gap in the line. */
function fillDays(
  from: string,
  to: string,
  rows: Array<{ day: string; amountPaise: string | number }>,
): CollectionPointDto[] {
  const byDay = new Map(rows.map((r) => [r.day, Number(r.amountPaise)]));
  const out: CollectionPointDto[] = [];
  for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) {
    out.push({ day: cursor, amountPaise: byDay.get(cursor) ?? 0 });
  }
  return out;
}

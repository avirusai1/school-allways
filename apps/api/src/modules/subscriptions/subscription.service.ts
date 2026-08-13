import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gt, ilike, inArray, or } from 'drizzle-orm';

import {
  academicSessions,
  classes,
  sections,
  studentEnrollments,
  studentSubscriptions,
  students,
  tenants,
} from '@saw/db';

import { RequestContextStore } from '../../common/context/request-context';
import { TenantDbService } from '../../common/database/tenant-db.service';
import { ApiException } from '../../common/errors/api.exception';
import { decodeCursor, encodeCursor } from '../../common/pagination';
import { assertInScope, scopeFilter } from '../../common/rbac/scope.util';
import type { GrantedPermission } from '../../common/context/request-context';
import {
  PARENT_SUBSCRIPTION_BASE_PAISE,
  PARENT_SUBSCRIPTION_GST_PAISE,
  PARENT_SUBSCRIPTION_TOTAL_PAISE,
  SUBSCRIPTION_GRACE_DAYS,
} from './billing.constants';
import { graceEndsAt, isInGracePeriod } from '../../common/rbac/subscription.util';
import { endOfDayIst } from './stay-connected.util';
import type { ListSubscriptionsQuery, ManualActivateDto } from './dto/subscriptions.dto';

const CHUNK = 500;

@Injectable()
export class SubscriptionService {
  constructor(private readonly db: TenantDbService) {}

  async list(query: ListSubscriptionsQuery, grant: GrantedPermission) {
    const ctx = RequestContextStore.get();
    const session = await this.requireCurrentSession();
    const predicate = scopeFilter(
      grant,
      {
        sectionId: studentEnrollments.sectionId,
        studentId: studentEnrollments.studentId,
        branchId: students.branchId,
      },
      { branchId: ctx.branchId },
    );

    const limit = Math.min(query.limit ?? 50, 100);
    const cursor = decodeCursor(query.cursor);

    return this.db.run(async (tx) => {
      const conditions = [
        eq(studentEnrollments.academicSessionId, session.id),
        inArray(studentEnrollments.status, ['active', 'admitted', 'on_leave']),
      ];
      if (predicate) conditions.push(predicate);
      if (query.classId) conditions.push(eq(studentEnrollments.classId, query.classId));
      if (query.sectionId) conditions.push(eq(studentEnrollments.sectionId, query.sectionId));
      if (query.q?.trim()) {
        const q = `%${query.q.trim()}%`;
        conditions.push(
          or(
            ilike(students.firstName, q),
            ilike(students.lastName, q),
            ilike(students.admissionNo, q),
          )!,
        );
      }
      if (cursor) {
        conditions.push(
          or(
            gt(students.firstName, cursor.value),
            and(eq(students.firstName, cursor.value), gt(students.id, cursor.id)),
          )!,
        );
      }

      const rows = await tx
        .select({
          id: students.id,
          firstName: students.firstName,
          lastName: students.lastName,
          admissionNo: students.admissionNo,
          className: classes.name,
          sectionName: sections.name,
          branchId: students.branchId,
          sectionId: studentEnrollments.sectionId,
          subscriptionStatus: studentSubscriptions.status,
          source: studentSubscriptions.source,
          expiresAt: studentSubscriptions.expiresAt,
          notes: studentSubscriptions.notes,
        })
        .from(studentEnrollments)
        .innerJoin(students, eq(students.id, studentEnrollments.studentId))
        .leftJoin(classes, eq(classes.id, studentEnrollments.classId))
        .leftJoin(sections, eq(sections.id, studentEnrollments.sectionId))
        .leftJoin(
          studentSubscriptions,
          and(
            eq(studentSubscriptions.studentId, students.id),
            eq(studentSubscriptions.academicSessionId, session.id),
          ),
        )
        .where(and(...conditions))
        .orderBy(asc(students.firstName), asc(students.id))
        .limit(limit + 1);

      const page = rows.slice(0, limit);
      const next = rows.length > limit ? rows[limit] : undefined;

      const now = new Date();
      const [tenant] = await tx
        .select({ activatedAt: tenants.activatedAt })
        .from(tenants)
        .where(eq(tenants.id, ctx.tenantId!))
        .limit(1);
      const inGrace = isInGracePeriod(tenant?.activatedAt ?? null, now, SUBSCRIPTION_GRACE_DAYS);

      return {
        data: page.map((r) => {
          const active = r.subscriptionStatus === 'active' && r.expiresAt && r.expiresAt > now;
          const subscribed = inGrace || Boolean(active);
          return {
            id: r.id,
            fullName: [r.firstName, r.lastName].filter(Boolean).join(' '),
            admissionNo: r.admissionNo,
            classLabel:
              r.className && r.sectionName
                ? `${r.className}-${r.sectionName}`
                : r.className ?? r.sectionName ?? null,
            subscribed,
            status: inGrace && !active ? 'grace' : active ? 'active' : 'locked',
            source: r.source,
            expiresAt: r.expiresAt?.toISOString() ?? null,
            notes: r.notes,
          };
        }),
        nextCursor: next ? encodeCursor(next.firstName, next.id) : null,
        meta: {
          academicSessionId: session.id,
          sessionName: session.name,
          sessionEndDate: session.endDate,
          inGrace,
          graceEndsAt: graceEndsAt(tenant?.activatedAt ?? null, SUBSCRIPTION_GRACE_DAYS)?.toISOString() ?? null,
          amountPaise: PARENT_SUBSCRIPTION_TOTAL_PAISE,
        },
      };
    });
  }

  async manualActivate(dto: ManualActivateDto, grant: GrantedPermission) {
    const ctx = RequestContextStore.get();
    if (!ctx.userId) {
      throw new ApiException(401, 'UNAUTHENTICATED', 'Sign in to activate subscriptions.');
    }
    if (!ctx.branchId) {
      throw new ApiException(422, 'BUSINESS_RULE', 'Choose a branch before activating subscriptions.');
    }
    if (dto.items.length === 0) {
      throw new ApiException(400, 'VALIDATION_FAILED', 'Select at least one student.');
    }
    if (dto.items.length > CHUNK) {
      throw new ApiException(
        400,
        'VALIDATION_FAILED',
        `Activate at most ${CHUNK} students at a time.`,
      );
    }

    const session = await this.requireCurrentSession();
    const expiresAt = endOfDayIst(session.endDate);
    const now = new Date();
    const activated: string[] = [];
    const skipped: string[] = [];
    const skippedReasons: Record<string, string> = {};

    const uniqueIds = [...new Set(dto.items.map((i) => i.studentId))];
    const notesById = new Map(dto.items.map((i) => [i.studentId, i.notes]));

    await this.db.run(async (tx) => {
      const studentRows = await tx
        .select({
          id: students.id,
          branchId: students.branchId,
          sectionId: studentEnrollments.sectionId,
        })
        .from(students)
        .leftJoin(
          studentEnrollments,
          and(
            eq(studentEnrollments.studentId, students.id),
            eq(studentEnrollments.academicSessionId, session.id),
          ),
        )
        .where(inArray(students.id, uniqueIds));

      const found = new Map(studentRows.map((s) => [s.id, s]));

      const existing = await tx
        .select({
          studentId: studentSubscriptions.studentId,
          status: studentSubscriptions.status,
        })
        .from(studentSubscriptions)
        .where(
          and(
            inArray(studentSubscriptions.studentId, uniqueIds),
            eq(studentSubscriptions.academicSessionId, session.id),
          ),
        );
      const existingByStudent = new Map(existing.map((e) => [e.studentId, e.status]));

      const toInsert: Array<{
        tenantId: string;
        branchId: string;
        studentId: string;
        academicSessionId: string;
        status: 'active';
        totalPaise: number;
        basePaise: number;
        gstPaise: number;
        source: 'manual_cash';
        activatedByUserId: string;
        activatedAt: Date;
        notes: string | null;
        expiresAt: Date;
        createdBy: string;
      }> = [];

      for (const id of uniqueIds) {
        const row = found.get(id);
        if (!row) {
          skipped.push(id);
          skippedReasons[id] = 'Student not found in this school.';
          continue;
        }
        try {
          assertInScope(grant, { studentId: id, sectionId: row.sectionId });
        } catch {
          skipped.push(id);
          skippedReasons[id] = 'Outside your assigned sections.';
          continue;
        }
        const prior = existingByStudent.get(id);
        if (prior === 'active') {
          skipped.push(id);
          skippedReasons[id] = 'Already subscribed for this session.';
          continue;
        }
        toInsert.push({
          tenantId: ctx.tenantId!,
          branchId: row.branchId,
          studentId: id,
          academicSessionId: session.id,
          status: 'active',
          totalPaise: PARENT_SUBSCRIPTION_TOTAL_PAISE,
          basePaise: PARENT_SUBSCRIPTION_BASE_PAISE,
          gstPaise: PARENT_SUBSCRIPTION_GST_PAISE,
          source: 'manual_cash',
          activatedByUserId: ctx.userId!,
          activatedAt: now,
          notes: notesById.get(id)?.trim() || null,
          expiresAt,
          createdBy: ctx.userId!,
        });
      }

      if (toInsert.length > 0) {
        const inserted = await tx
          .insert(studentSubscriptions)
          .values(toInsert)
          .onConflictDoNothing()
          .returning({ studentId: studentSubscriptions.studentId });
        for (const row of inserted) activated.push(row.studentId);
        for (const row of toInsert) {
          if (!activated.includes(row.studentId) && !skipped.includes(row.studentId)) {
            skipped.push(row.studentId);
            skippedReasons[row.studentId] = 'Already subscribed for this session.';
          }
        }
      }
    });

    RequestContextStore.addAudit({
      action: 'subscription.manual.activate',
      entityType: 'student_subscriptions',
      changes: {
        activated: { from: 0, to: activated.length },
        skipped: { from: 0, to: skipped.length },
        amountPaise: { from: 0, to: activated.length * PARENT_SUBSCRIPTION_TOTAL_PAISE },
      },
    });

    return {
      activated,
      skipped,
      skippedReasons,
      billedAmountPaise: activated.length * PARENT_SUBSCRIPTION_TOTAL_PAISE,
    };
  }

  private async requireCurrentSession() {
    const ctx = RequestContextStore.get();
    const [session] = await this.db.run((tx) =>
      tx
        .select({
          id: academicSessions.id,
          name: academicSessions.name,
          endDate: academicSessions.endDate,
        })
        .from(academicSessions)
        .where(
          and(
            eq(academicSessions.tenantId, ctx.tenantId!),
            eq(academicSessions.isCurrent, true),
          ),
        )
        .limit(1),
    );
    if (!session) {
      throw new NotFoundException('No current academic session is configured.');
    }
    return session;
  }
}

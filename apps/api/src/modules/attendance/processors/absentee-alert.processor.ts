import { Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import { guardians, studentAttendance, studentGuardians, students } from '@saw/db';

import { TenantDbService } from '../../../common/database/tenant-db.service';
import { NotificationService } from '../../notifications/notification.service';

/**
 * Debounces to one notification per child per day, then hands off to
 * NotificationService (push → escalate to SMS if unread).
 */
@Injectable()
export class AbsenteeAlertProcessor {
  private readonly logger = new Logger(AbsenteeAlertProcessor.name);

  constructor(
    private readonly db: TenantDbService,
    private readonly notifications: NotificationService,
  ) {}

  async process(payload: {
    tenantId: string;
    registerId: string;
    day: string;
    studentIds: string[];
  }): Promise<void> {
    if (payload.studentIds.length === 0) return;

    const toNotify = await this.db.asTenant(payload.tenantId, async (tx) => {
      const prior = await tx
        .select({
          studentId: studentAttendance.studentId,
          parentNotifiedAt: studentAttendance.parentNotifiedAt,
        })
        .from(studentAttendance)
        .where(
          and(
            eq(studentAttendance.day, payload.day),
            inArray(studentAttendance.studentId, payload.studentIds),
            inArray(studentAttendance.status, ['absent', 'late']),
          ),
        );

      const alreadyNotified = new Set(
        prior
          .filter((r) => r.parentNotifiedAt != null)
          .map((r) => r.studentId),
      );
      return [...new Set(prior.map((r) => r.studentId))].filter(
        (id) => !alreadyNotified.has(id),
      );
    });

    if (toNotify.length === 0) return;

    const recipients = await this.db.asTenant(payload.tenantId, async (tx) => {
      const names = await tx
        .select({ id: students.id, firstName: students.firstName })
        .from(students)
        .where(inArray(students.id, toNotify));

      const guardianRows = await tx
        .select({
          studentId: studentGuardians.studentId,
          userId: guardians.userId,
        })
        .from(studentGuardians)
        .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
        .where(
          and(
            inArray(studentGuardians.studentId, toNotify),
            eq(studentGuardians.isPrimary, true),
          ),
        );

      const nameById = new Map(names.map((n) => [n.id, n.firstName]));
      return guardianRows
        .filter((g) => g.userId)
        .map((g) => ({
          userId: g.userId!,
          studentId: g.studentId,
          studentName: nameById.get(g.studentId) ?? 'your child',
        }));
    });

    const unique = new Map<string, { userId: string; studentId: string; studentName: string }>();
    for (const r of recipients) unique.set(`${r.userId}:${r.studentId}`, r);

    if (unique.size > 0) {
      try {
        // One call for the whole register. The child's name differs per parent,
        // so it rides in per-recipient variables rather than forcing a notify()
        // per family — a 40-absence day was 40 queue writes.
        //
        // SMS is listed even though push leads: a parent who has not installed
        // the app yet is the normal case in a school's first month, and the
        // ladder falls back for them without paying for anyone else.
        await this.notifications.notify({
          tenantId: payload.tenantId,
          templateCode: 'STUDENT_ABSENT',
          recipients: [...unique.values()].map((r) => ({
            userId: r.userId,
            studentId: r.studentId,
            variables: {
              studentName: r.studentName,
              date: payload.day,
              studentId: r.studentId,
            },
          })),
          variables: { date: payload.day },
          priority: 'high',
          channels: ['push', 'in_app', 'sms'],
        });
      } catch (err) {
        this.logger.error(
          `Absentee notify failed register=${payload.registerId}: ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    await this.db.asTenant(payload.tenantId, async (tx) => {
      await tx
        .update(studentAttendance)
        .set({ parentNotifiedAt: new Date() })
        .where(
          and(
            eq(studentAttendance.registerId, payload.registerId),
            inArray(studentAttendance.studentId, toNotify),
            inArray(studentAttendance.status, ['absent', 'late']),
            isNull(studentAttendance.parentNotifiedAt),
          ),
        );
    });
  }
}

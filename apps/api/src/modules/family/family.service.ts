import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';

import {
  announcements,
  classes,
  homework,
  homeworkSubmissions,
  leaveRequests,
  periods,
  sections,
  subjects,
  timetableSlots,
  studentAttendance,
  studentEnrollments,
  studentDocuments,
  students,
} from '@saw/db';

import type { GrantedPermission } from '../../common/context/request-context';
import { RequestContextStore } from '../../common/context/request-context';
import { TenantDbService } from '../../common/database/tenant-db.service';
import { ApiException } from '../../common/errors/api.exception';
import { assertInScope } from '../../common/rbac/scope.util';
import { SubscriptionAccessService } from '../../common/rbac/subscription-access.service';
import { StorageService } from '../../common/storage/storage.service';
import { publicFileUrl } from '../../common/utils/url.util';
import { FeesService } from '../fees/fees.service';
import { TransportService } from '../transport/transport.service';
import type { FamilyChildProfileDto, FamilyLeaveRequestDto } from './dto/family.dto';

/**
 * Family home BFF — ONE round-trip for the parent home feed.
 */
@Injectable()
export class FamilyService {
  constructor(
    private readonly db: TenantDbService,
    private readonly fees: FeesService,
    private readonly transport: TransportService,
    private readonly storage: StorageService,
    private readonly subscriptions: SubscriptionAccessService,
    private readonly config: ConfigService,
  ) {}

  async home(studentId: string, grant: GrantedPermission) {
    assertInScope(grant, { studentId });

    const lock = (await this.subscriptions.statusForStudents([studentId])).get(studentId);
    const subscribed = lock?.subscribed === true;

    const today = new Date();
    const day = today.toISOString().slice(0, 10);
    const todayLabel = formatDayLabel(today);

    if (!subscribed) {
      return this.lockedHome(studentId, day, todayLabel, lock ?? null);
    }

    const feesDuePaise = await this.fees.outstandingPaiseForStudent(studentId);
    const busInfo = await this.transport.familyBusForStudent(studentId, grant);

    return this.db.run(async (tx) => {
      const [student] = await tx
        .select({
          id: students.id,
          firstName: students.firstName,
          lastName: students.lastName,
          photoPath: students.photoPath,
        })
        .from(students)
        .where(eq(students.id, studentId))
        .limit(1);

      if (!student) throw new NotFoundException('Student not found');

      const [enrollment] = await tx
        .select({
          sectionId: studentEnrollments.sectionId,
          classId: studentEnrollments.classId,
          rollNo: studentEnrollments.rollNo,
        })
        .from(studentEnrollments)
        .where(
          and(
            eq(studentEnrollments.studentId, studentId),
            inArray(studentEnrollments.status, ['active', 'admitted', 'on_leave']),
          ),
        )
        .limit(1);

      const [attendanceToday] = await tx
        .select({
          status: studentAttendance.status,
          inTime: studentAttendance.inTime,
        })
        .from(studentAttendance)
        .where(
          and(
            eq(studentAttendance.studentId, studentId),
            eq(studentAttendance.day, day),
          ),
        )
        .limit(1);

      const dueHomework = await tx
        .select({
          id: homework.id,
          title: homework.title,
          dueOn: homework.dueOn,
          subjectId: homework.subjectId,
          submissionStatus: homeworkSubmissions.status,
          seenAt: homeworkSubmissions.seenAt,
        })
        .from(homeworkSubmissions)
        .innerJoin(homework, eq(homework.id, homeworkSubmissions.homeworkId))
        .where(
          and(
            eq(homeworkSubmissions.studentId, studentId),
            eq(homework.status, 'published'),
            inArray(homeworkSubmissions.status, ['pending', 'submitted']),
            or(isNull(homework.dueOn), gte(homework.dueOn, day)),
          ),
        )
        .orderBy(homework.dueOn)
        .limit(10);

      const dueTodayCount = dueHomework.filter(
        (h) => h.dueOn === day || h.dueOn == null,
      ).length;

      const notices = await tx
        .select({
          id: announcements.id,
          title: announcements.title,
          body: announcements.body,
          type: announcements.type,
          sentAt: announcements.sentAt,
          requiresAcknowledgement: announcements.requiresAcknowledgement,
        })
        .from(announcements)
        .where(
          and(
            eq(announcements.status, 'approved'),
            or(isNull(announcements.sentAt), lte(announcements.sentAt, sql`now()`)),
          ),
        )
        .orderBy(desc(announcements.sentAt))
        .limit(5);

      const needsAttention: Array<{
        severity: 'red' | 'orange' | 'blue';
        title: string;
        route: string;
      }> = [];

      // Overdue homework (due before today, still pending)
      const overdue = await tx
        .select({ id: homework.id, title: homework.title, dueOn: homework.dueOn })
        .from(homeworkSubmissions)
        .innerJoin(homework, eq(homework.id, homeworkSubmissions.homeworkId))
        .where(
          and(
            eq(homeworkSubmissions.studentId, studentId),
            eq(homework.status, 'published'),
            eq(homeworkSubmissions.status, 'pending'),
            sql`${homework.dueOn} IS NOT NULL AND ${homework.dueOn} < ${day}`,
          ),
        )
        .limit(3);

      for (const item of overdue) {
        needsAttention.push({
          severity: 'orange',
          title: `Homework overdue: ${item.title}`,
          route: `/homework/${item.id}`,
        });
      }

      const attendanceLabel = (() => {
        switch (attendanceToday?.status) {
          case 'present':
          case 'late':
            return 'Present';
          case 'absent':
            return 'Absent';
          case 'half_day':
            return 'Half day';
          default:
            return '—';
        }
      })();

      return {
        locked: false,
        subscription: {
          status: lock?.status ?? 'active',
          expiresAt: lock?.expiresAt ?? null,
          graceEndsAt: lock?.graceEndsAt ?? null,
        },
        student: {
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          fullName: [student.firstName, student.lastName].filter(Boolean).join(' '),
          photoPath: student.photoPath,
          sectionId: enrollment?.sectionId ?? null,
          rollNo: enrollment?.rollNo ?? null,
        },
        today: {
          label: todayLabel,
          day,
          attendance: {
            status: attendanceToday?.status ?? null,
            label: attendanceLabel,
            inTime: attendanceToday?.inTime ?? null,
          },
          homeworkDueCount: dueHomework.length,
          homeworkDueTodayCount: dueTodayCount,
          feesDuePaise,
        },
        bus: busInfo
          ? {
              routeName: busInfo.routeName,
              stopsAway: busInfo.stopsAway ?? 0,
              eta: busInfo.eta ?? '—',
              stopName: busInfo.stopName ?? null,
              live: busInfo.live,
            }
          : null,
        needsAttention,
        homeworkDue: dueHomework.slice(0, 3).map((h) => ({
          id: h.id,
          title: h.title,
          dueOn: h.dueOn,
          subjectId: h.subjectId,
          submissionStatus: h.submissionStatus,
          seenAt: h.seenAt?.toISOString() ?? null,
          dueToday: h.dueOn === day,
        })),
        notices: notices.map((n) => ({
          id: n.id,
          title: n.title,
          preview: (n.body ?? '').slice(0, 120),
          type: n.type,
          publishedAt: n.sentAt?.toISOString() ?? null,
          requiresAcknowledgement: n.requiresAcknowledgement,
          unread: false,
        })),
        latestPhotos: [] as Array<{ id: string; thumbUrl: string }>,
      };
    });
  }

  /**
   * Student's own home feed.
   *
   * A student is NOT a guardian: the `student` role deliberately withholds
   * `family.child.read` (that permission means "view own children"). So this
   * deliberately mirrors `home()` minus everything the role is denied —
   * no fees, no bus, no sibling switcher. Adding those here would hand a
   * child data the role explicitly negates with `!fee.invoice.read`.
   */
  async selfHome(grant: GrantedPermission) {
    const studentId = (grant.studentIds ?? [])[0];
    if (!studentId) {
      throw new NotFoundException(
        'This account is not linked to a student record.',
      );
    }
    assertInScope(grant, { studentId });

    const day = new Date().toISOString().slice(0, 10);
    const filesBase = this.config.getOrThrow<string>('FILES_BASE_URL');

    return this.db.run(async (tx) => {
      const [student] = await tx
        .select({
          id: students.id,
          firstName: students.firstName,
          lastName: students.lastName,
          photoPath: students.photoPath,
          className: classes.name,
          sectionName: sections.name,
          rollNo: studentEnrollments.rollNo,
        })
        .from(students)
        .leftJoin(
          studentEnrollments,
          and(
            eq(studentEnrollments.studentId, students.id),
            inArray(studentEnrollments.status, ['active', 'admitted', 'on_leave']),
          ),
        )
        .leftJoin(classes, eq(classes.id, studentEnrollments.classId))
        .leftJoin(sections, eq(sections.id, studentEnrollments.sectionId))
        .where(eq(students.id, studentId))
        .limit(1);

      if (!student) throw new NotFoundException('Student not found');

      const [attendanceToday] = await tx
        .select({ status: studentAttendance.status, inTime: studentAttendance.inTime })
        .from(studentAttendance)
        .where(
          and(
            eq(studentAttendance.studentId, studentId),
            eq(studentAttendance.day, day),
          ),
        )
        .limit(1);

      const dueHomework = await tx
        .select({
          id: homework.id,
          title: homework.title,
          dueOn: homework.dueOn,
          subjectId: homework.subjectId,
          submissionStatus: homeworkSubmissions.status,
        })
        .from(homeworkSubmissions)
        .innerJoin(homework, eq(homework.id, homeworkSubmissions.homeworkId))
        .where(
          and(
            eq(homeworkSubmissions.studentId, studentId),
            eq(homework.status, 'published'),
            inArray(homeworkSubmissions.status, ['pending', 'submitted']),
            or(isNull(homework.dueOn), gte(homework.dueOn, day)),
          ),
        )
        .orderBy(homework.dueOn)
        .limit(10);

      const overdue = await tx
        .select({ id: homework.id, title: homework.title, dueOn: homework.dueOn })
        .from(homeworkSubmissions)
        .innerJoin(homework, eq(homework.id, homeworkSubmissions.homeworkId))
        .where(
          and(
            eq(homeworkSubmissions.studentId, studentId),
            eq(homework.status, 'published'),
            eq(homeworkSubmissions.status, 'pending'),
            sql`${homework.dueOn} IS NOT NULL AND ${homework.dueOn} < ${day}`,
          ),
        )
        .limit(5);

      const notices = await tx
        .select({
          id: announcements.id,
          title: announcements.title,
          body: announcements.body,
          type: announcements.type,
          sentAt: announcements.sentAt,
        })
        .from(announcements)
        .where(
          and(
            eq(announcements.status, 'approved'),
            or(isNull(announcements.sentAt), lte(announcements.sentAt, sql`now()`)),
          ),
        )
        .orderBy(desc(announcements.sentAt))
        .limit(5);

      const classLabel =
        student.className && student.sectionName
          ? `${student.className}-${student.sectionName}`
          : student.className ?? null;

      const attendanceLabel = (() => {
        switch (attendanceToday?.status) {
          case 'present':
            return attendanceToday?.inTime ? `Present · ${attendanceToday.inTime}` : 'Present';
          case 'absent':
            return 'Absent';
          case 'late':
            return 'Late';
          case 'half_day':
            return 'Half day';
          case 'on_leave':
            return 'On leave';
          default:
            return 'Not marked yet';
        }
      })();

      const dueTodayCount = dueHomework.filter(
        (h) => h.dueOn === day || h.dueOn == null,
      ).length;

      /**
       * Deliberately the SAME key names as `home()` so the existing clients
       * parse this with no model changes — `FamilyHome.fromJson` is fully
       * null-tolerant, so the omitted `bus`/`feesDuePaise` simply read as
       * absent rather than needing a second contract.
       */
      return {
        locked: false,
        student: {
          id: student.id,
          fullName: `${student.firstName} ${student.lastName ?? ''}`.trim(),
          firstName: student.firstName,
          lastName: student.lastName ?? null,
          photoPath: student.photoPath ?? null,
          photoUrl: publicFileUrl(filesBase, student.photoPath),
          classLabel,
          rollNo: student.rollNo ?? null,
        },
        today: {
          label: 'TODAY',
          day,
          attendance: {
            status: attendanceToday?.status ?? 'not_marked',
            label: attendanceLabel,
          },
          homeworkDueCount: dueTodayCount,
          // A student holds `!fee.invoice.read` / `!fee.status.read`. Zero here
          // is not "nothing owed" — fees are simply not this role's business.
          feesDuePaise: 0,
        },
        needsAttention: overdue.map((item) => ({
          severity: 'orange' as const,
          title: `Homework overdue: ${item.title}`,
          route: `/homework/${item.id}`,
        })),
        homeworkDue: dueHomework,
        notices,
      };
    });
  }

  /**
   * The student's own weekly timetable.
   *
   * `timetable.read` is granted to the student, class teacher and several other
   * roles, but no endpoint in the API had ever required it — the periods and
   * timetable_slots tables have existed since the first migration with nothing
   * reading them. Slots are effective-dated so a mid-year change does not
   * rewrite history; only rows effective today are returned.
   */
  async selfTimetable(grant: GrantedPermission) {
    const studentId = (grant.studentIds ?? [])[0];
    if (!studentId) {
      throw new NotFoundException('This account is not linked to a student record.');
    }
    assertInScope(grant, { studentId });

    const day = new Date().toISOString().slice(0, 10);

    return this.db.run(async (tx) => {
      const [enrollment] = await tx
        .select({ sectionId: studentEnrollments.sectionId })
        .from(studentEnrollments)
        .where(
          and(
            eq(studentEnrollments.studentId, studentId),
            inArray(studentEnrollments.status, ['active', 'admitted', 'on_leave']),
          ),
        )
        .limit(1);

      if (!enrollment?.sectionId) {
        return { data: [], sectionId: null };
      }

      const rows = await tx
        .select({
          id: timetableSlots.id,
          weekday: timetableSlots.weekday,
          roomNo: timetableSlots.roomNo,
          subjectName: subjects.name,
          periodName: periods.name,
          sequence: periods.sequence,
          startTime: periods.startTime,
          endTime: periods.endTime,
          isBreak: periods.isBreak,
        })
        .from(timetableSlots)
        .innerJoin(periods, eq(periods.id, timetableSlots.periodId))
        .leftJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
        .where(
          and(
            eq(timetableSlots.sectionId, enrollment.sectionId),
            or(
              isNull(timetableSlots.effectiveFrom),
              lte(timetableSlots.effectiveFrom, day),
            ),
            or(
              isNull(timetableSlots.effectiveTo),
              gte(timetableSlots.effectiveTo, day),
            ),
          ),
        )
        .orderBy(timetableSlots.weekday, periods.sequence);

      return { data: rows, sectionId: enrollment.sectionId };
    });
  }

  async listChildren(grant: GrantedPermission) {
    const ids = grant.studentIds ?? [];
    if (grant.scope === 'self' && ids.length === 0) {
      return { data: [] };
    }

    const listed = await this.db.run(async (tx) => {
      const conditions =
        grant.scope === 'self'
          ? [inArray(students.id, ids)]
          : [];

      // Left-join active enrollment for the switcher "Class 5-A" label (build/13 §4).
      // Multiple enrollments can exist across sessions — take the first row per student.
      const rows = await tx
        .select({
          id: students.id,
          firstName: students.firstName,
          lastName: students.lastName,
          photoPath: students.photoPath,
          className: classes.name,
          sectionName: sections.name,
        })
        .from(students)
        .leftJoin(
          studentEnrollments,
          and(
            eq(studentEnrollments.studentId, students.id),
            inArray(studentEnrollments.status, ['active', 'admitted', 'on_leave']),
          ),
        )
        .leftJoin(classes, eq(classes.id, studentEnrollments.classId))
        .leftJoin(sections, eq(sections.id, studentEnrollments.sectionId))
        .where(conditions.length ? and(...conditions) : sql`false`)
        .limit(40);

      const seen = new Set<string>();
      const data: Array<{
        id: string;
        fullName: string;
        firstName: string;
        photoPath: string | null;
        classLabel: string | null;
        subscribed: boolean;
        status: 'grace' | 'active' | 'locked';
        expiresAt: string | null;
        graceEndsAt: string | null;
      }> = [];

      for (const r of rows) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        const classLabel =
          r.className && r.sectionName
            ? `Class ${r.className}-${r.sectionName}`
            : r.className
              ? `Class ${r.className}`
              : r.sectionName
                ? r.sectionName
                : null;
        data.push({
          id: r.id,
          fullName: [r.firstName, r.lastName].filter(Boolean).join(' '),
          firstName: r.firstName,
          photoPath: r.photoPath,
          classLabel,
          subscribed: false,
          status: 'locked',
          expiresAt: null,
          graceEndsAt: null,
        });
        if (data.length >= 20) break;
      }

      return data;
    });

    const locks = await this.subscriptions.statusForStudents(listed.map((d) => d.id));
    for (const row of listed) {
      const lock = locks.get(row.id);
      if (!lock) continue;
      row.subscribed = lock.subscribed;
      row.status = lock.status;
      row.expiresAt = lock.expiresAt;
      row.graceEndsAt = lock.graceEndsAt;
    }

    return { data: listed };
  }

  /**
   * The parent's side of the invitation bargain: they fill in what the school's
   * import could not. Scope does the ownership check — a `self`-scoped grant
   * carries exactly this guardian's children, so a parent cannot reach another
   * family's record by changing the id in the URL.
   *
   * Only the keys actually sent are written. The form shows one field or four
   * depending on what is blank, and a partial save must not null the rest.
   */
  async updateChildProfile(
    studentId: string,
    dto: FamilyChildProfileDto,
    grant: GrantedPermission,
  ) {
    assertInScope(grant, { studentId });
    await this.subscriptions.assertSubscribed(studentId);

    const patch: Record<string, unknown> = {};
    for (const key of [
      'addressLine1', 'addressLine2', 'city', 'district', 'state',
      'pincode', 'dateOfBirth',
    ] as const) {
      if (dto[key] !== undefined) patch[key] = dto[key];
    }
    if (dto.bloodGroup !== undefined) patch.bloodGroup = dto.bloodGroup;
    if (dto.photoPath !== undefined) patch.photoPath = dto.photoPath;

    if (Object.keys(patch).length === 0) {
      throw new ApiException(
        400,
        'VALIDATION_FAILED',
        'Nothing to save — fill in at least one detail.',
      );
    }

    return this.db.run(async (tx) => {
      const [updated] = await tx
        .update(students)
        .set(patch)
        .where(eq(students.id, studentId))
        .returning({
          id: students.id,
          photoPath: students.photoPath,
          addressLine1: students.addressLine1,
          dateOfBirth: students.dateOfBirth,
          bloodGroup: students.bloodGroup,
        });

      if (!updated) {
        throw new NotFoundException('That student record could not be found.');
      }

      return {
        id: updated.id,
        // What is still blank after this save, so the screen can decide whether
        // the parent is done or still owes a field.
        missingFields: [
          ...(updated.addressLine1 ? [] : ['address']),
          ...(updated.photoPath ? [] : ['photo']),
          ...(updated.dateOfBirth ? [] : ['dateOfBirth']),
          ...(updated.bloodGroup && updated.bloodGroup !== 'unknown' ? [] : ['bloodGroup']),
        ],
      };
    });
  }

  /**
   * Stores the photo and returns its key; the caller then sends that key back
   * with the rest of the profile. Two steps rather than one multipart save so
   * the picture can be previewed before the parent commits to it, and so a
   * dropped connection mid-upload does not lose the typed fields.
   */
  async uploadChildPhoto(
    studentId: string,
    file: Express.Multer.File,
    grant: GrantedPermission,
  ) {
    assertInScope(grant, { studentId });
    await this.subscriptions.assertSubscribed(studentId);
    const ctx = RequestContextStore.get();

    const ext = (file.originalname.split('.').pop() ?? 'jpg')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    const key = `t/${ctx.tenantId}/students/${studentId}/photo.${ext || 'jpg'}`;

    const { promises: fs } = await import('node:fs');
    const data = file.buffer?.length ? file.buffer : await fs.readFile(file.path);
    await this.storage.writeBuffer(key, data);

    const filesBase = this.config.getOrThrow<string>('FILES_BASE_URL');
    return { photoPath: key, photoUrl: publicFileUrl(filesBase, key) };
  }

  /**
   * Generic document upload during profile completion — birth certificate, ID
   * proof, or whatever label the parent types. Stored as a student_documents
   * row; the school verifies later.
   */
  async uploadChildDocument(
    studentId: string,
    file: Express.Multer.File,
    docType: string,
    title: string | undefined,
    grant: GrantedPermission,
  ) {
    assertInScope(grant, { studentId });
    await this.subscriptions.assertSubscribed(studentId);
    const ctx = RequestContextStore.get();

    const label = docType.trim().slice(0, 50);
    if (!label) {
      throw new ApiException(400, 'VALIDATION_FAILED', 'Enter what kind of document this is.');
    }

    const ext = (file.originalname.split('.').pop() ?? 'bin')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    const key = `t/${ctx.tenantId}/students/${studentId}/docs/${randomUUID()}.${ext || 'bin'}`;

    const { promises: fs } = await import('node:fs');
    const data = file.buffer?.length ? file.buffer : await fs.readFile(file.path);
    await this.storage.writeBuffer(key, data);

    const [row] = await this.db.run(async (tx) =>
      tx
        .insert(studentDocuments)
        .values({
          tenantId: ctx.tenantId!,
          studentId,
          docType: label,
          title: title?.trim().slice(0, 150) ?? null,
          filePath: key,
          fileSizeBytes: data.length,
          mimeType: file.mimetype?.slice(0, 100) ?? null,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({
          id: studentDocuments.id,
          docType: studentDocuments.docType,
          filePath: studentDocuments.filePath,
        }),
    );

    const filesBase = this.config.getOrThrow<string>('FILES_BASE_URL');
    return {
      id: row!.id,
      docType: row!.docType,
      filePath: row!.filePath,
      fileUrl: publicFileUrl(filesBase, row!.filePath),
    };
  }

  /** Parent leave request — optimistic Pending on the client. */
  async requestLeave(dto: FamilyLeaveRequestDto, grant: GrantedPermission) {
    assertInScope(grant, { studentId: dto.studentId });
    await this.subscriptions.assertSubscribed(dto.studentId);
    if (dto.toDate < dto.fromDate) {
      throw new ApiException(
        400,
        'VALIDATION_FAILED',
        'Leave end date must be on or after the start date.',
      );
    }

    const ctx = RequestContextStore.get();
    const dayCount = daysInclusive(dto.fromDate, dto.toDate);

    return this.db.run(async (tx) => {
      if (dto.clientMutationId) {
        const [existing] = await tx
          .select({
            id: leaveRequests.id,
            status: leaveRequests.status,
            fromDate: leaveRequests.fromDate,
            toDate: leaveRequests.toDate,
            reason: leaveRequests.reason,
          })
          .from(leaveRequests)
          .where(
            and(
              eq(leaveRequests.studentId, dto.studentId),
              eq(leaveRequests.reason, dto.reason),
              eq(leaveRequests.fromDate, dto.fromDate),
              eq(leaveRequests.toDate, dto.toDate),
            ),
          )
          .limit(1);
        // Soft idempotency when the same parent retries the same request.
        if (existing) return existing;
      }

      const [row] = await tx
        .insert(leaveRequests)
        .values({
          tenantId: ctx.tenantId!,
          branchId: ctx.branchId!,
          studentId: dto.studentId,
          requestedByUserId: ctx.userId!,
          fromDate: dto.fromDate,
          toDate: dto.toDate,
          dayCount,
          reason: dto.reason,
          attachmentPath: dto.attachmentPath,
          status: 'pending',
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({
          id: leaveRequests.id,
          studentId: leaveRequests.studentId,
          fromDate: leaveRequests.fromDate,
          toDate: leaveRequests.toDate,
          reason: leaveRequests.reason,
          status: leaveRequests.status,
          dayCount: leaveRequests.dayCount,
        });

      return row!;
    });
  }

  async listLeaveRequests(studentId: string, grant: GrantedPermission) {
    assertInScope(grant, { studentId });
    await this.subscriptions.assertSubscribed(studentId);
    return this.db.run(async (tx) => {
      const rows = await tx
        .select({
          id: leaveRequests.id,
          fromDate: leaveRequests.fromDate,
          toDate: leaveRequests.toDate,
          reason: leaveRequests.reason,
          status: leaveRequests.status,
          dayCount: leaveRequests.dayCount,
          createdAt: leaveRequests.createdAt,
        })
        .from(leaveRequests)
        .where(eq(leaveRequests.studentId, studentId))
        .orderBy(desc(leaveRequests.createdAt))
        .limit(50);
      return { data: rows };
    });
  }

  /**
   * Unpaid parent: today's attendance only. Everything else is stripped so a
   * missed assert on a nested field cannot leak paid content.
   */
  private async lockedHome(
    studentId: string,
    day: string,
    todayLabel: string,
    lock: {
      status: 'grace' | 'active' | 'locked';
      expiresAt: string | null;
      graceEndsAt: string | null;
    } | null,
  ) {
    return this.db.run(async (tx) => {
      const [student] = await tx
        .select({
          id: students.id,
          firstName: students.firstName,
          lastName: students.lastName,
          photoPath: students.photoPath,
        })
        .from(students)
        .where(eq(students.id, studentId))
        .limit(1);

      if (!student) throw new NotFoundException('Student not found');

      const [enrollment] = await tx
        .select({
          sectionId: studentEnrollments.sectionId,
          rollNo: studentEnrollments.rollNo,
        })
        .from(studentEnrollments)
        .where(
          and(
            eq(studentEnrollments.studentId, studentId),
            inArray(studentEnrollments.status, ['active', 'admitted', 'on_leave']),
          ),
        )
        .limit(1);

      const [attendanceToday] = await tx
        .select({
          status: studentAttendance.status,
          inTime: studentAttendance.inTime,
        })
        .from(studentAttendance)
        .where(and(eq(studentAttendance.studentId, studentId), eq(studentAttendance.day, day)))
        .limit(1);

      const attendanceLabel = (() => {
        switch (attendanceToday?.status) {
          case 'present':
          case 'late':
            return 'Present';
          case 'absent':
            return 'Absent';
          case 'half_day':
            return 'Half day';
          default:
            return '—';
        }
      })();

      return {
        locked: true,
        subscription: {
          status: lock?.status ?? 'locked',
          expiresAt: lock?.expiresAt ?? null,
          graceEndsAt: lock?.graceEndsAt ?? null,
        },
        student: {
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          fullName: [student.firstName, student.lastName].filter(Boolean).join(' '),
          photoPath: student.photoPath,
          sectionId: enrollment?.sectionId ?? null,
          rollNo: enrollment?.rollNo ?? null,
        },
        today: {
          label: todayLabel,
          day,
          attendance: {
            status: attendanceToday?.status ?? null,
            label: attendanceLabel,
            inTime: attendanceToday?.inTime ?? null,
          },
          homeworkDueCount: 0,
          homeworkDueTodayCount: 0,
          feesDuePaise: 0,
        },
        bus: null,
        needsAttention: [] as Array<{ severity: 'red' | 'orange' | 'blue'; title: string; route: string }>,
        homeworkDue: [],
        notices: [],
        latestPhotos: [] as Array<{ id: string; thumbUrl: string }>,
      };
    });
  }
}

function formatDayLabel(d: Date): string {
  return d
    .toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
    .toUpperCase();
}

function daysInclusive(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.max(1, Math.floor((b - a) / 86_400_000) + 1);
}

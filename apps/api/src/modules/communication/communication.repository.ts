import { Injectable } from '@nestjs/common';
import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';

import {
  announcements,
  classes,
  deliveryAttempts,
  guardians,
  messageThreads,
  messages,
  sections,
  studentEnrollments,
  studentGuardians,
  students,
  threadParticipants,
  users,
} from '@saw/db';

import type { Tx } from '../../common/database/tenant-db.service';

@Injectable()
export class CommunicationRepository {
  listAnnouncements(
    tx: Tx,
    params: {
      type?: string;
      cursor?: { value: string; id: string };
      limit: number;
    },
  ) {
    const conditions: SQL[] = [sql`${announcements.sentAt} IS NOT NULL`];
    if (params.type) conditions.push(eq(announcements.type, params.type as never));

    if (params.cursor) {
      conditions.push(
        or(
          lt(announcements.createdAt, new Date(params.cursor.value)),
          and(
            eq(announcements.createdAt, new Date(params.cursor.value)),
            lt(announcements.id, params.cursor.id),
          ),
        )!,
      );
    }

    return tx
      .select({
        id: announcements.id,
        type: announcements.type,
        priority: announcements.priority,
        title: announcements.title,
        body: announcements.body,
        requiresAcknowledgement: announcements.requiresAcknowledgement,
        recipientCount: announcements.recipientCount,
        deliveredCount: announcements.deliveredCount,
        readCount: announcements.readCount,
        sentAt: announcements.sentAt,
        createdAt: announcements.createdAt,
        status: announcements.status,
      })
      .from(announcements)
      .where(and(...conditions))
      .orderBy(desc(announcements.createdAt), desc(announcements.id))
      .limit(params.limit + 1);
  }

  findAnnouncement(tx: Tx, id: string) {
    return tx
      .select({
        id: announcements.id,
        type: announcements.type,
        priority: announcements.priority,
        title: announcements.title,
        body: announcements.body,
        audienceType: announcements.audienceType,
        audienceRefs: announcements.audienceRefs,
        channels: announcements.channels,
        status: announcements.status,
        requiresAcknowledgement: announcements.requiresAcknowledgement,
        recipientCount: announcements.recipientCount,
        deliveredCount: announcements.deliveredCount,
        readCount: announcements.readCount,
        sentAt: announcements.sentAt,
        branchId: announcements.branchId,
        createdBy: announcements.createdBy,
      })
      .from(announcements)
      .where(eq(announcements.id, id))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  async resolveAudienceUserIds(
    tx: Tx,
    audienceType: string,
    audienceRefs: Record<string, string[]>,
  ): Promise<string[]> {
    if (audienceType === 'individual') {
      return audienceRefs.userIds ?? [];
    }

    if (audienceType === 'section' || audienceType === 'class') {
      const sectionIds = audienceRefs.sectionIds ?? [];
      const classIds = audienceRefs.classIds ?? [];
      const enrollmentConds: SQL[] = [];
      if (sectionIds.length) {
        enrollmentConds.push(inArray(studentEnrollments.sectionId, sectionIds));
      }
      if (classIds.length) {
        enrollmentConds.push(inArray(studentEnrollments.classId, classIds));
      }
      if (enrollmentConds.length === 0) return [];

      const rows = await tx
        .select({ userId: guardians.userId })
        .from(studentGuardians)
        .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
        .innerJoin(
          studentEnrollments,
          eq(studentEnrollments.studentId, studentGuardians.studentId),
        )
        .where(and(...enrollmentConds, sql`${guardians.userId} IS NOT NULL`));

      return [...new Set(rows.map((r) => r.userId!).filter(Boolean))];
    }

    if (audienceType === 'all_parents' || audienceType === 'all') {
      const rows = await tx
        .select({ userId: guardians.userId })
        .from(guardians)
        .where(sql`${guardians.userId} IS NOT NULL`);
      return [...new Set(rows.map((r) => r.userId!).filter(Boolean))];
    }

    return [];
  }

  listUnreadForAnnouncement(tx: Tx, announcementId: string) {
    return tx
      .select({
        recipientUserId: deliveryAttempts.recipientUserId,
        fullName: users.fullName,
      })
      .from(deliveryAttempts)
      .innerJoin(users, eq(users.id, deliveryAttempts.recipientUserId))
      .where(
        and(
          eq(deliveryAttempts.announcementId, announcementId),
          eq(deliveryAttempts.channel, 'in_app'),
          isNull(deliveryAttempts.readAt),
        ),
      )
      .limit(100);
  }

  countAcknowledged(tx: Tx, announcementId: string) {
    return tx
      .select({ count: sql<number>`count(*)::int` })
      .from(deliveryAttempts)
      .where(
        and(
          eq(deliveryAttempts.announcementId, announcementId),
          sql`${deliveryAttempts.acknowledgedAt} IS NOT NULL`,
        ),
      )
      .then((rows) => Number(rows[0]?.count ?? 0));
  }

  listThreads(tx: Tx, userId: string, studentId?: string) {
    const conditions: SQL[] = [eq(threadParticipants.userId, userId)];
    if (studentId) conditions.push(eq(messageThreads.studentId, studentId));

    return tx
      .select({
        id: messageThreads.id,
        subject: messageThreads.subject,
        studentId: messageThreads.studentId,
        lastMessageAt: messageThreads.lastMessageAt,
        isClosed: messageThreads.isClosed,
        myDisplayAs: threadParticipants.displayAs,
      })
      .from(threadParticipants)
      .innerJoin(messageThreads, eq(messageThreads.id, threadParticipants.threadId))
      .where(and(...conditions))
      .orderBy(desc(messageThreads.lastMessageAt))
      .limit(50);
  }

  listParticipants(tx: Tx, threadId: string) {
    return tx
      .select({
        userId: threadParticipants.userId,
        displayAs: threadParticipants.displayAs,
        lastReadAt: threadParticipants.lastReadAt,
      })
      .from(threadParticipants)
      .where(eq(threadParticipants.threadId, threadId));
  }

  isParticipant(tx: Tx, threadId: string, userId: string) {
    return tx
      .select({ id: threadParticipants.id })
      .from(threadParticipants)
      .where(
        and(
          eq(threadParticipants.threadId, threadId),
          eq(threadParticipants.userId, userId),
        ),
      )
      .limit(1)
      .then((rows) => !!rows[0]);
  }

  listMessages(
    tx: Tx,
    threadId: string,
    cursor?: { value: string; id: string },
    limit = 50,
  ) {
    const conditions: SQL[] = [eq(messages.threadId, threadId)];
    if (cursor) {
      conditions.push(
        or(
          lt(messages.createdAt, new Date(cursor.value)),
          and(
            eq(messages.createdAt, new Date(cursor.value)),
            lt(messages.id, cursor.id),
          ),
        )!,
      );
    }

    return tx
      .select({
        id: messages.id,
        senderUserId: messages.senderUserId,
        body: messages.body,
        attachmentPaths: messages.attachmentPaths,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(limit + 1);
  }

  async findStudentWithSection(tx: Tx, studentId: string) {
    const [row] = await tx
      .select({
        firstName: students.firstName,
        lastName: students.lastName,
        sectionName: sections.name,
        className: classes.name,
        branchId: students.branchId,
      })
      .from(students)
      .leftJoin(
        studentEnrollments,
        and(
          eq(studentEnrollments.studentId, students.id),
          inArray(studentEnrollments.status, ['active', 'admitted', 'on_leave']),
        ),
      )
      .leftJoin(sections, eq(sections.id, studentEnrollments.sectionId))
      .leftJoin(classes, eq(classes.id, studentEnrollments.classId))
      .where(eq(students.id, studentId))
      .limit(1);
    return row ?? null;
  }

  findUserKind(tx: Tx, userId: string) {
    return tx
      .select({ kind: users.kind, fullName: users.fullName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }
}

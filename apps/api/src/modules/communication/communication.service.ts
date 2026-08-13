import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, sql } from 'drizzle-orm';

import {
  announcements,
  deliveryAttempts,
  messageThreads,
  messages,
  threadParticipants,
} from '@saw/db';

import { RequestContextStore } from '../../common/context/request-context';
import { TenantDbService } from '../../common/database/tenant-db.service';
import { ApiException } from '../../common/errors/api.exception';
import { decodeCursor, encodeCursor, type Page } from '../../common/pagination';
import { NotificationService } from '../notifications/notification.service';
import { isInQuietHours, nextQuietHoursEnd } from '../notifications/quiet-hours.util';
import { CommunicationRepository } from './communication.repository';
import type {
  CreateAnnouncementDto,
  CreateThreadDto,
  ListAnnouncementsQuery,
  SendMessageDto,
} from './dto/communication.dto';

@Injectable()
export class CommunicationService {
  constructor(
    private readonly config: ConfigService,
    private readonly db: TenantDbService,
    private readonly repo: CommunicationRepository,
    private readonly notifications: NotificationService,
  ) {}

  async listAnnouncements(query: ListAnnouncementsQuery): Promise<Page<unknown>> {
    const limit = Math.min(query.limit, 100);
    return this.db.run(async (tx) => {
      const rows = await this.repo.listAnnouncements(tx, {
        type: query.type,
        cursor: decodeCursor(query.cursor),
        limit,
      });
      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const last = page.at(-1);

      return {
        data: page.map((r) => ({
          id: r.id,
          type: r.type,
          priority: r.priority,
          title: r.title,
          body: r.body,
          requiresAcknowledgement: r.requiresAcknowledgement,
          recipientCount: r.recipientCount,
          deliveredCount: r.deliveredCount,
          readCount: r.readCount,
          sentAt: r.sentAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
        })),
        meta: {
          hasMore,
          count: page.length,
          nextCursor:
            hasMore && last
              ? encodeCursor(last.createdAt.toISOString(), last.id)
              : null,
        },
      };
    });
  }

  async createAnnouncement(dto: CreateAnnouncementDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [created] = await tx
        .insert(announcements)
        .values({
          tenantId: ctx.tenantId!,
          branchId: dto.branchId ?? ctx.branchId,
          type: dto.type as never,
          priority: dto.priority,
          title: dto.title,
          body: dto.body,
          audienceType: dto.audienceType as never,
          audienceRefs: dto.audienceRefs ?? {},
          channels: dto.channels ?? ['push', 'in_app'],
          requiresAcknowledgement: dto.requiresAcknowledgement ?? false,
          status: 'draft',
          createdBy: ctx.userId,
        })
        .returning({ id: announcements.id, status: announcements.status });

      RequestContextStore.addAudit({
        action: 'announcement.created',
        entityType: 'announcements',
        entityId: created.id,
      });

      return created;
    });
  }

  async publish(announcementId: string, scheduledFor?: string | null) {
    const ctx = RequestContextStore.get();

    const announcement = await this.db.run((tx) =>
      this.repo.findAnnouncement(tx, announcementId),
    );
    if (!announcement) throw new NotFoundException('Announcement not found');
    if (announcement.status === 'draft') {
      // Teachers may need approval — principal publish path sets approved.
    }

    // Resolve audience OUTSIDE the hot request path? Spec says audience
    // resolution runs in a job. We enqueue notify immediately after marking
    // published; recipient insert is chunked inside NotificationService.
    const userIds = await this.db.run((tx) =>
      this.repo.resolveAudienceUserIds(
        tx,
        announcement.audienceType,
        (announcement.audienceRefs ?? {}) as Record<string, string[]>,
      ),
    );

    await this.db.run(async (tx) => {
      await tx
        .update(announcements)
        .set({
          status: 'approved',
          approvedByUserId: ctx.userId,
          approvedAt: sql`now()`,
          sentAt: scheduledFor ? null : sql`now()`,
          scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
          recipientCount: userIds.length,
        })
        .where(eq(announcements.id, announcementId));
    });

    const result = await this.notifications.notify({
      tenantId: ctx.tenantId!,
      templateCode: 'ANNOUNCEMENT',
      announcementId,
      recipients: userIds.map((userId) => ({ userId })),
      variables: { title: announcement.title },
      priority: announcement.priority as never,
      channels: (announcement.channels as never) ?? ['push', 'in_app'],
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
    });

    // Mark in_app as delivered for counter freshness (denormalised).
    await this.db.run(async (tx) => {
      await tx
        .update(announcements)
        .set({ deliveredCount: userIds.length })
        .where(eq(announcements.id, announcementId));
    });

    return {
      id: announcementId,
      recipientCount: userIds.length,
      queued: result.queued,
      deferred: result.deferred,
    };
  }

  async acknowledge(announcementId: string) {
    const ctx = RequestContextStore.get();
    if (!ctx.userId) throw new ApiException(401, 'UNAUTHENTICATED', 'Missing access token');

    await this.db.run(async (tx) => {
      // Only recipients with a delivery row may acknowledge — otherwise anyone
      // with the UUID could inflate another audience's read counters.
      const [delivery] = await tx
        .select({ id: deliveryAttempts.id })
        .from(deliveryAttempts)
        .where(
          and(
            eq(deliveryAttempts.announcementId, announcementId),
            eq(deliveryAttempts.recipientUserId, ctx.userId!),
          ),
        )
        .limit(1);

      if (!delivery) {
        throw new ApiException(
          404,
          'NOT_FOUND',
          'No delivery of this announcement was found for you.',
        );
      }

      await tx
        .update(deliveryAttempts)
        .set({ acknowledgedAt: sql`now()`, readAt: sql`now()`, status: 'read' })
        .where(eq(deliveryAttempts.id, delivery.id));

      await tx
        .update(announcements)
        .set({ readCount: sql`${announcements.readCount} + 1` })
        .where(eq(announcements.id, announcementId));
    });

    return { acknowledged: true };
  }

  async delivery(announcementId: string) {
    return this.db.run(async (tx) => {
      const announcement = await this.repo.findAnnouncement(tx, announcementId);
      if (!announcement) throw new NotFoundException('Announcement not found');

      const acknowledgedCount = await this.repo.countAcknowledged(tx, announcementId);
      const unread = await this.repo.listUnreadForAnnouncement(tx, announcementId);

      return {
        recipientCount: announcement.recipientCount,
        deliveredCount: announcement.deliveredCount,
        readCount: announcement.readCount,
        acknowledgedCount,
        unreadRecipients: unread.map((u) => ({
          guardianName: u.fullName,
          // studentName / sectionLabel enriched when join path is available
          studentName: null,
          sectionLabel: null,
        })),
      };
    });
  }

  // -------------------------------------------------------------------------
  // Threads — masked messaging
  // -------------------------------------------------------------------------

  async listThreads(studentId?: string) {
    const ctx = RequestContextStore.get();
    if (!ctx.userId) throw new ApiException(401, 'UNAUTHENTICATED', 'Missing access token');

    const rows = await this.db.run((tx) =>
      this.repo.listThreads(tx, ctx.userId!, studentId),
    );

    // Never include phone numbers.
    return {
      data: rows.map((r) => ({
        id: r.id,
        subject: r.subject,
        studentId: r.studentId,
        lastMessageAt: r.lastMessageAt?.toISOString() ?? null,
        isClosed: r.isClosed,
        displayAs: r.myDisplayAs,
      })),
      meta: { hasMore: false, count: rows.length, nextCursor: null },
    };
  }

  async createThread(dto: CreateThreadDto) {
    const ctx = RequestContextStore.get();
    if (!ctx.userId) throw new ApiException(401, 'UNAUTHENTICATED', 'Missing access token');

    return this.db.run(async (tx) => {
      const student = await this.repo.findStudentWithSection(tx, dto.studentId);
      if (!student) throw new NotFoundException('Student not found');

      const sectionLabel = student.className && student.sectionName
        ? `${student.className}-${student.sectionName}`
        : student.sectionName ?? '';
      const studentName = [student.firstName, student.lastName].filter(Boolean).join(' ');

      const [thread] = await tx
        .insert(messageThreads)
        .values({
          tenantId: ctx.tenantId!,
          branchId: student.branchId,
          studentId: dto.studentId,
          subject: dto.subject ?? `About ${studentName}`,
          threadType: 'parent_teacher',
          createdBy: ctx.userId,
        })
        .returning({ id: messageThreads.id });

      const participantIds = [...new Set([ctx.userId!, ...dto.participantUserIds])];

      for (const userId of participantIds) {
        const user = await this.repo.findUserKind(tx, userId);
        const isStaff = user?.kind === 'staff' || user?.kind === 'platform';
        const displayAs = isStaff
          ? `${user?.fullName ?? 'Teacher'} · Class Teacher${sectionLabel ? `, ${sectionLabel}` : ''}`
          : `Parent of ${studentName}${sectionLabel ? ` (${sectionLabel})` : ''}`;

        await tx.insert(threadParticipants).values({
          tenantId: ctx.tenantId!,
          threadId: thread.id,
          userId,
          displayAs,
        });
      }

      return { id: thread.id };
    });
  }

  async listMessages(threadId: string, cursor?: string) {
    const ctx = RequestContextStore.get();
    if (!ctx.userId) throw new ApiException(401, 'UNAUTHENTICATED', 'Missing access token');

    return this.db.run(async (tx) => {
      const ok = await this.repo.isParticipant(tx, threadId, ctx.userId!);
      if (!ok) {
        throw new ApiException(403, 'SCOPE_VIOLATION', 'You are not part of this conversation.');
      }

      const participants = await this.repo.listParticipants(tx, threadId);
      const displayByUser = new Map(participants.map((p) => [p.userId, p.displayAs]));

      const rows = await this.repo.listMessages(tx, threadId, decodeCursor(cursor));
      const hasMore = rows.length > 50;
      const page = hasMore ? rows.slice(0, 50) : rows;
      const last = page.at(-1);

      return {
        data: page.map((m) => ({
          id: m.id,
          senderUserId: m.senderUserId,
          senderDisplayAs: displayByUser.get(m.senderUserId) ?? 'Participant',
          body: m.body,
          attachmentPaths: m.attachmentPaths ?? [],
          createdAt: m.createdAt.toISOString(),
          // Explicitly no phone fields — see phone-masking test.
        })),
        meta: {
          hasMore,
          count: page.length,
          nextCursor:
            hasMore && last
              ? encodeCursor(last.createdAt.toISOString(), last.id)
              : null,
        },
        deliveryHint: this.quietHoursHint(),
      };
    });
  }

  async sendMessage(threadId: string, dto: SendMessageDto, mutationId?: string) {
    const ctx = RequestContextStore.get();
    if (!ctx.userId) throw new ApiException(401, 'UNAUTHENTICATED', 'Missing access token');

    return this.db.run(async (tx) => {
      const ok = await this.repo.isParticipant(tx, threadId, ctx.userId!);
      if (!ok) {
        throw new ApiException(403, 'SCOPE_VIOLATION', 'You are not part of this conversation.');
      }

      if (mutationId) {
        const [existing] = await tx
          .select({ id: messages.id, body: messages.body, createdAt: messages.createdAt })
          .from(messages)
          .where(eq(messages.clientMutationId, mutationId))
          .limit(1);
        if (existing) {
          return {
            id: existing.id,
            body: existing.body,
            createdAt: existing.createdAt.toISOString(),
            deliveryHint: this.quietHoursHint(),
          };
        }
      }

      const [created] = await tx
        .insert(messages)
        .values({
          tenantId: ctx.tenantId!,
          threadId,
          senderUserId: ctx.userId!,
          body: dto.body,
          attachmentPaths: dto.attachmentPaths ?? [],
          clientMutationId: mutationId ?? null,
        })
        .returning({
          id: messages.id,
          body: messages.body,
          createdAt: messages.createdAt,
        });

      await tx
        .update(messageThreads)
        .set({ lastMessageAt: sql`now()` })
        .where(eq(messageThreads.id, threadId));

      return {
        id: created.id,
        body: created.body,
        createdAt: created.createdAt.toISOString(),
        deliveryHint: this.quietHoursHint(),
      };
    });
  }

  async markThreadRead(threadId: string) {
    const ctx = RequestContextStore.get();
    if (!ctx.userId) return { read: false };

    await this.db.run(async (tx) => {
      await tx
        .update(threadParticipants)
        .set({ lastReadAt: sql`now()` })
        .where(
          and(
            eq(threadParticipants.threadId, threadId),
            eq(threadParticipants.userId, ctx.userId!),
          ),
        );
    });
    return { read: true };
  }

  private quietHoursHint(): string | null {
    const start = this.config.get('COMMS_QUIET_HOURS_START') ?? '21:00';
    const end = this.config.get('COMMS_QUIET_HOURS_END') ?? '07:00';
    if (!isInQuietHours(new Date(), start, end)) return null;
    const deliverAt = nextQuietHoursEnd(new Date(), end);
    const hh = String(deliverAt.getHours()).padStart(2, '0');
    const mm = String(deliverAt.getMinutes()).padStart(2, '0');
    return `Messages sent now will be delivered at ${hh}:${mm}.`;
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull, or } from 'drizzle-orm';

import {
  announcements,
  deliveryAttempts,
  messages,
  notificationTemplates,
} from '@saw/db';

import { RequestContextStore } from '../../common/context/request-context';
import { TenantDbService } from '../../common/database/tenant-db.service';
import { renderTemplate } from './quiet-hours.util';

export type InboxItem = {
  id: string;
  title: string;
  body: string;
  priority: string;
  readAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  templateCode: string | null;
  announcementId: string | null;
};

@Injectable()
export class NotificationInboxService {
  constructor(private readonly db: TenantDbService) {}

  async list(limit = 50): Promise<{ data: InboxItem[]; meta: { unread: number } }> {
    const ctx = RequestContextStore.get();
    const userId = ctx.userId!;

    return this.db.run(async (tx) => {
      const rows = await tx
        .select({
          id: deliveryAttempts.id,
          templateCode: deliveryAttempts.templateCode,
          announcementId: deliveryAttempts.announcementId,
          messageId: deliveryAttempts.messageId,
          priority: deliveryAttempts.priority,
          readAt: deliveryAttempts.readAt,
          deliveredAt: deliveryAttempts.deliveredAt,
          createdAt: deliveryAttempts.createdAt,
          variables: deliveryAttempts.variables,
          announcementTitle: announcements.title,
          announcementBody: announcements.body,
          messageBody: messages.body,
        })
        .from(deliveryAttempts)
        .leftJoin(announcements, eq(announcements.id, deliveryAttempts.announcementId))
        .leftJoin(messages, eq(messages.id, deliveryAttempts.messageId))
        .where(
          and(
            eq(deliveryAttempts.recipientUserId, userId),
            eq(deliveryAttempts.channel, 'in_app'),
          ),
        )
        .orderBy(desc(deliveryAttempts.createdAt))
        .limit(Math.min(limit, 100));

      const templateCodes = [
        ...new Set(rows.map((r) => r.templateCode).filter((c): c is string => Boolean(c))),
      ];
      const templates = await this.loadInAppTemplates(tx, templateCodes);

      const data: InboxItem[] = [];
      for (const row of rows) {
        const rendered = this.renderRow(row, templates);
        if (!rendered) continue;
        data.push({
          id: row.id,
          title: rendered.title,
          body: rendered.body,
          priority: row.priority,
          readAt: row.readAt?.toISOString() ?? null,
          deliveredAt: row.deliveredAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
          templateCode: row.templateCode,
          announcementId: row.announcementId,
        });
      }

      const unread = data.filter((d) => !d.readAt).length;
      return { data, meta: { unread } };
    });
  }

  async markRead(id: string): Promise<void> {
    const ctx = RequestContextStore.get();
    const userId = ctx.userId!;

    const updated = await this.db.run(async (tx) => {
      const [row] = await tx
        .update(deliveryAttempts)
        .set({ readAt: new Date(), status: 'read', updatedAt: new Date() })
        .where(
          and(
            eq(deliveryAttempts.id, id),
            eq(deliveryAttempts.recipientUserId, userId),
            eq(deliveryAttempts.channel, 'in_app'),
          ),
        )
        .returning({ id: deliveryAttempts.id });
      return row;
    });

    if (!updated) {
      throw new NotFoundException('Notification not found.');
    }
  }

  private renderRow(
    row: {
      templateCode: string | null;
      announcementTitle: string | null;
      announcementBody: string | null;
      messageBody: string | null;
      variables: Record<string, string> | null;
    },
    templates: Map<string, { subject: string | null; body: string }>,
  ): { title: string; body: string } | null {
    if (row.announcementTitle) {
      return { title: row.announcementTitle, body: row.announcementBody ?? '' };
    }
    if (row.messageBody) {
      return { title: 'Message', body: row.messageBody };
    }
    if (row.templateCode) {
      const tpl = templates.get(row.templateCode);
      if (!tpl) return null;
      const vars = row.variables ?? {};
      return {
        title: tpl.subject ? renderTemplate(tpl.subject, vars) : 'Notification',
        body: renderTemplate(tpl.body, vars),
      };
    }
    return null;
  }

  private async loadInAppTemplates(
    tx: Parameters<Parameters<TenantDbService['run']>[0]>[0],
    codes: string[],
  ) {
    const map = new Map<string, { subject: string | null; body: string }>();
    if (codes.length === 0) return map;

    const ctx = RequestContextStore.get();
    const rows = await tx
      .select({
        code: notificationTemplates.code,
        tenantId: notificationTemplates.tenantId,
        subject: notificationTemplates.subject,
        body: notificationTemplates.body,
      })
      .from(notificationTemplates)
      .where(
        and(
          eq(notificationTemplates.channel, 'in_app'),
          eq(notificationTemplates.isActive, true),
          or(
            isNull(notificationTemplates.tenantId),
            eq(notificationTemplates.tenantId, ctx.tenantId!),
          ),
        ),
      );

    for (const code of codes) {
      const tenantCopy = rows.find((r) => r.code === code && r.tenantId !== null);
      const globalCopy = rows.find((r) => r.code === code && r.tenantId === null);
      const pick = tenantCopy ?? globalCopy;
      if (pick) map.set(code, { subject: pick.subject, body: pick.body });
    }
    return map;
  }
}

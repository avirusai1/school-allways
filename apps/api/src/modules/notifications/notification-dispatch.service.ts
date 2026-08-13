/**
 * Turns queued rows in the delivery ledger into actual sends.
 *
 * This runs in the worker, never on a request. Every message the product sends
 * — invitations, absence alerts, circulars, fee reminders — arrives here, so
 * the two rules that keep the SMS bill survivable live here too:
 *
 *   1. in_app costs nothing and is always attempted.
 *   2. Paid channels are a LADDER, not a broadcast. WhatsApp is tried before
 *      SMS and the ladder stops at the first success, so one parent being told
 *      one thing is billed once.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';

import { deviceTokens, notificationTemplates, users } from '@saw/db';

import { TenantDbService, type Tx } from '../../common/database/tenant-db.service';
import {
  isPaidChannel,
  PAID_CHANNELS,
  type NotificationFanOutJob,
  type NotifyChannel,
} from './notification.types';
import {
  NOTIFICATION_PROVIDER,
  type NotificationProvider,
} from './providers/notification-provider';
import { routeForTemplate } from './push-route.util';
import { renderTemplate } from './quiet-hours.util';

/** One row of the ledger, as handed to the worker. */
export interface DispatchTarget {
  attemptId: string;
  userId: string;
  channel: NotifyChannel;
  variables: Record<string, string>;
}

/**
 * `channels` is absent by design: each target already carries the channel its
 * ledger row was written for, and a second list would be a second source of
 * truth that could disagree with the rows being updated.
 */
export interface DispatchJob
  extends Omit<NotificationFanOutJob, 'recipients' | 'channels'> {
  targets: DispatchTarget[];
}

interface Outcome {
  attemptId: string;
  status: 'sent' | 'delivered' | 'failed' | 'skipped';
  providerRef: string | null;
  providerName: string | null;
  costPaise: number;
  failureReason: string | null;
}

interface Contact {
  phone: string | null;
  email: string | null;
  pushTokens: string[];
}

@Injectable()
export class NotificationDispatchService {
  private readonly logger = new Logger(NotificationDispatchService.name);

  constructor(
    private readonly db: TenantDbService,
    @Inject(NOTIFICATION_PROVIDER) private readonly provider: NotificationProvider,
  ) {}

  async dispatch(job: DispatchJob): Promise<{ sent: number; failed: number; skipped: number }> {
    if (job.targets.length === 0) return { sent: 0, failed: 0, skipped: 0 };

    const userIds = [...new Set(job.targets.map((t) => t.userId))];
    const [templates, contacts] = await Promise.all([
      this.loadTemplates(job.tenantId, job.templateCode),
      this.loadContacts(job.tenantId, userIds),
    ]);

    const byUser = new Map<string, DispatchTarget[]>();
    for (const t of job.targets) {
      const list = byUser.get(t.userId);
      if (list) list.push(t);
      else byUser.set(t.userId, [t]);
    }

    const outcomes: Outcome[] = [];
    for (const [userId, targets] of byUser) {
      outcomes.push(
        ...(await this.dispatchUser(
          userId,
          targets,
          contacts.get(userId),
          templates,
          job.templateCode,
          job.tenantId,
        )),
      );
    }

    await this.persist(job.tenantId, outcomes);

    const tally = { sent: 0, failed: 0, skipped: 0 };
    for (const o of outcomes) {
      if (o.status === 'failed') tally.failed += 1;
      else if (o.status === 'skipped') tally.skipped += 1;
      else tally.sent += 1;
    }
    return tally;
  }

  /**
   * Free channels first, then at most one paid channel. The paid ladder is
   * skipped entirely when a free channel already carried the message and the
   * caller did not ask for a paid channel specifically — see the per-channel
   * decision in NotificationService, which is what puts the rows here.
   */
  private async dispatchUser(
    userId: string,
    targets: DispatchTarget[],
    contact: Contact | undefined,
    templates: Map<NotifyChannel, { body: string; subject: string | null; dltTemplateId: string | null; dltEntityId: string | null }>,
    templateCode: string,
    tenantId: string,
  ): Promise<Outcome[]> {
    const out: Outcome[] = [];
    const free = targets.filter((t) => !isPaidChannel(t.channel));
    const paid = targets
      .filter((t) => isPaidChannel(t.channel))
      .sort((a, b) => PAID_CHANNELS.indexOf(a.channel) - PAID_CHANNELS.indexOf(b.channel));

    for (const target of free) {
      out.push(await this.sendOne(target, contact, templates, templateCode, tenantId));
    }

    let carried = false;
    for (const target of paid) {
      if (carried) {
        out.push({
          attemptId: target.attemptId,
          status: 'skipped',
          providerRef: null,
          providerName: null,
          costPaise: 0,
          failureReason: 'Delivered on an earlier channel in the ladder',
        });
        continue;
      }
      const result = await this.sendOne(target, contact, templates, templateCode, tenantId);
      out.push(result);
      if (result.status === 'sent' || result.status === 'delivered') carried = true;
    }

    if (out.length === 0) {
      this.logger.warn(`No dispatchable channel for user=${userId} template=${templateCode}`);
    }
    return out;
  }

  private async sendOne(
    target: DispatchTarget,
    contact: Contact | undefined,
    templates: Map<NotifyChannel, { body: string; subject: string | null; dltTemplateId: string | null; dltEntityId: string | null }>,
    templateCode: string,
    tenantId: string,
  ): Promise<Outcome> {
    const skip = (reason: string): Outcome => ({
      attemptId: target.attemptId,
      status: 'skipped',
      providerRef: null,
      providerName: null,
      costPaise: 0,
      failureReason: reason,
    });
    const fail = (reason: string): Outcome => ({
      attemptId: target.attemptId,
      status: 'failed',
      providerRef: null,
      providerName: this.provider.name,
      costPaise: 0,
      failureReason: reason,
    });

    const template = templates.get(target.channel) ?? templates.get('in_app');
    if (!template) {
      return fail(`No '${templateCode}' template registered for ${target.channel}`);
    }
    const body = renderTemplate(template.body, target.variables);

    // in_app is the row itself — the recipient's inbox reads the ledger, so
    // there is nothing to hand to a provider and nothing that can bounce.
    if (target.channel === 'in_app') {
      return {
        attemptId: target.attemptId,
        status: 'delivered',
        providerRef: null,
        providerName: 'in_app',
        costPaise: 0,
        failureReason: null,
      };
    }

    const provider = this.resolveProvider(target.channel);
    if (!provider) {
      return skip(`No provider registered for ${target.channel}`);
    }

    if (target.channel === 'sms' && provider.requiresDltTemplate && !template.dltTemplateId) {
      return fail(`SMS template '${templateCode}' is not registered with DLT`);
    }

    const subject = template.subject
      ? renderTemplate(template.subject, target.variables)
      : null;

    // One parent, several handsets: send to every active token. The ledger
    // still has one row per channel; any success counts as delivered.
    if (target.channel === 'push') {
      const tokens = contact?.pushTokens ?? [];
      if (tokens.length === 0) return skip(`No ${addressName('push')} on file`);
      return this.sendPushAll(target, provider, tokens, {
        body,
        subject,
        templateCode,
        dltTemplateId: template.dltTemplateId,
        dltEntityId: template.dltEntityId,
        tenantId,
        data: pushData(templateCode, target.variables),
      });
    }

    const to = this.addressFor(target.channel, contact);
    if (!to) return skip(`No ${addressName(target.channel)} on file`);

    try {
      const res = await provider.send({
        channel: target.channel,
        to,
        body,
        subject,
        templateCode,
        dltTemplateId: template.dltTemplateId,
        dltEntityId: template.dltEntityId,
        tenantId,
      });
      return {
        attemptId: target.attemptId,
        status: res.status,
        providerRef: res.providerRef,
        providerName: provider.name,
        costPaise: res.costPaise,
        failureReason: res.failureReason ?? null,
      };
    } catch (err) {
      return {
        attemptId: target.attemptId,
        status: 'failed',
        providerRef: null,
        providerName: provider.name,
        costPaise: 0,
        failureReason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async sendPushAll(
    target: DispatchTarget,
    provider: NotificationProvider,
    tokens: string[],
    shared: {
      body: string;
      subject: string | null;
      templateCode: string;
      dltTemplateId: string | null;
      dltEntityId: string | null;
      tenantId: string;
      data: Record<string, string>;
    },
  ): Promise<Outcome> {
    let lastFail: string | null = null;
    let firstRef: string | null = null;
    let anySent = false;

    for (const token of tokens) {
      try {
        const res = await provider.send({
          channel: 'push',
          to: token,
          body: shared.body,
          subject: shared.subject,
          templateCode: shared.templateCode,
          dltTemplateId: shared.dltTemplateId,
          dltEntityId: shared.dltEntityId,
          tenantId: shared.tenantId,
          data: shared.data,
        });
        if (res.status === 'sent') {
          anySent = true;
          firstRef ??= res.providerRef;
        } else {
          lastFail = res.failureReason ?? lastFail;
        }
      } catch (err) {
        lastFail = err instanceof Error ? err.message : String(err);
      }
    }

    if (anySent) {
      return {
        attemptId: target.attemptId,
        status: 'sent',
        providerRef: firstRef,
        providerName: provider.name,
        costPaise: 0,
        failureReason: null,
      };
    }

    return {
      attemptId: target.attemptId,
      status: 'failed',
      providerRef: null,
      providerName: provider.name,
      costPaise: 0,
      failureReason: lastFail ?? 'Push send failed',
    };
  }

  private resolveProvider(channel: NotifyChannel) {
    const routing = this.provider as NotificationProvider & {
      pick?: (channel: NotifyChannel) => NotificationProvider | null;
    };
    if (typeof routing.pick === 'function') {
      return routing.pick(channel);
    }
    return this.provider.channels.includes(channel) ? this.provider : null;
  }

  /**
   * Immediate one-off send for OTP (and other transactional mail) that must
   * leave before a ledger fan-out job would run. Still goes through the same
   * provider router as invite dispatch — Gmail when configured, log otherwise.
   */
  async sendDirect(req: {
    channel: NotifyChannel;
    to: string;
    body: string;
    subject: string | null;
    templateCode: string;
  }): Promise<{ status: 'sent' | 'failed'; providerName: string; failureReason?: string }> {
    const provider = this.resolveProvider(req.channel);
    if (!provider) {
      return {
        status: 'failed',
        providerName: 'none',
        failureReason: `No provider for ${req.channel}`,
      };
    }
    const res = await provider.send({
      channel: req.channel,
      to: req.to,
      body: req.body,
      subject: req.subject,
      templateCode: req.templateCode,
      dltTemplateId: null,
      dltEntityId: null,
    });
    return {
      status: res.status,
      providerName: provider.name,
      failureReason: res.failureReason,
    };
  }

  private addressFor(channel: NotifyChannel, contact: Contact | undefined): string | null {
    if (!contact) return null;
    if (channel === 'email') return contact.email;
    if (channel === 'push') return contact.pushTokens[0] ?? null;
    return contact.phone;
  }

  private async loadTemplates(
    tenantId: string,
    code: string,
  ): Promise<
    Map<
      NotifyChannel,
      { body: string; subject: string | null; dltTemplateId: string | null; dltEntityId: string | null }
    >
  > {
    // A school may override the wording; the global row (tenant_id NULL) is the
    // fallback. One query fetches both and the tenant's copy wins on collision.
    const rows = await this.db.asTenant(tenantId, (tx) =>
      tx
        .select({
          tenantId: notificationTemplates.tenantId,
          channel: notificationTemplates.channel,
          subject: notificationTemplates.subject,
          body: notificationTemplates.body,
          dltTemplateId: notificationTemplates.dltTemplateId,
          dltEntityId: notificationTemplates.dltEntityId,
        })
        .from(notificationTemplates)
        .where(
          and(
            eq(notificationTemplates.code, code),
            eq(notificationTemplates.isActive, true),
            or(
              isNull(notificationTemplates.tenantId),
              eq(notificationTemplates.tenantId, tenantId),
            ),
          ),
        ),
    );

    const map = new Map<
      NotifyChannel,
      { body: string; subject: string | null; dltTemplateId: string | null; dltEntityId: string | null }
    >();
    for (const r of rows) {
      const channel = r.channel as NotifyChannel;
      if (map.has(channel) && r.tenantId === null) continue;
      map.set(channel, {
        body: r.body,
        subject: r.subject,
        dltTemplateId: r.dltTemplateId,
        dltEntityId: r.dltEntityId,
      });
    }
    return map;
  }

  private async loadContacts(
    tenantId: string,
    userIds: string[],
  ): Promise<Map<string, Contact>> {
    const map = new Map<string, Contact>();
    if (userIds.length === 0) return map;

    // `users` is global, not tenant-scoped, so the contact lookup runs
    // unscoped; the device token read is tenant-scoped and joins back on it.
    const people = await this.db.runUnscoped((tx) =>
      tx
        .select({ id: users.id, phone: users.phone, email: users.email })
        .from(users)
        .where(inArray(users.id, userIds)),
    );
    for (const p of people) {
      map.set(p.id, { phone: p.phone, email: p.email, pushTokens: [] });
    }

    const tokens = await this.db.asTenant(tenantId, (tx) =>
      tx
        .select({ userId: deviceTokens.userId, token: deviceTokens.fcmToken })
        .from(deviceTokens)
        .where(
          and(inArray(deviceTokens.userId, userIds), eq(deviceTokens.isActive, true)),
        ),
    );
    for (const t of tokens) {
      map.get(t.userId)?.pushTokens.push(t.token);
    }

    return map;
  }

  /**
   * One UPDATE ... FROM (VALUES …) per chunk. A per-row update loop here would
   * be 1,200 round trips for a 400-parent circular on three channels.
   */
  private async persist(tenantId: string, outcomes: Outcome[]): Promise<void> {
    const CHUNK = 500;
    for (let i = 0; i < outcomes.length; i += CHUNK) {
      const chunk = outcomes.slice(i, i + CHUNK);
      await this.db.asTenant(tenantId, (tx) => this.persistChunk(tx, chunk));
    }
  }

  private async persistChunk(tx: Tx, chunk: Outcome[]): Promise<void> {
    const values = chunk.map(
      (o) =>
        sql`(${o.attemptId}::uuid, ${o.status}::delivery_status, ${o.providerRef}::varchar,
             ${o.providerName}::varchar, ${o.costPaise}::int, ${o.failureReason}::text)`,
    );

    await tx.execute(sql`
      update delivery_attempts as d
      set status = v.status,
          provider_ref = v.provider_ref,
          provider_name = v.provider_name,
          cost_paise = v.cost_paise,
          failure_reason = v.failure_reason,
          sent_at = case when v.status in ('sent','delivered') then now() else d.sent_at end,
          delivered_at = case when v.status = 'delivered' then now() else d.delivered_at end,
          failed_at = case when v.status = 'failed' then now() else d.failed_at end
      from (values ${sql.join(values, sql`, `)})
        as v(id, status, provider_ref, provider_name, cost_paise, failure_reason)
      where d.id = v.id
    `);
  }
}

function addressName(channel: NotifyChannel): string {
  if (channel === 'email') return 'email address';
  if (channel === 'push') return 'registered device';
  return 'mobile number';
}

function pushData(
  templateCode: string,
  variables: Record<string, string>,
): Record<string, string> {
  const data: Record<string, string> = {
    templateCode,
    route: routeForTemplate(templateCode),
  };
  if (variables.studentId) data.studentId = variables.studentId;
  return data;
}

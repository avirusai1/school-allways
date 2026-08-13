/**
 * Real Gmail SMTP delivery for the email channel.
 *
 * Gmail (consumer) daily send limit is roughly 500 messages/day; Google
 * Workspace is higher (typically 2,000/day). Fine for a handful of pilot
 * schools; revisit before any school with thousands of parents goes live on
 * the same mailbox — at that point SES/Postmark (or Workspace with a dedicated
 * sending domain) is the next step, not a bigger Gmail inbox.
 *
 * Auth must be an App Password (Google Account → Security → 2-Step Verification
 * → App passwords). The account password itself is rejected by SMTP.
 *
 * When GMAIL_USER / GMAIL_APP_PASSWORD are unset the module factory skips
 * registering this provider and email falls through to the logging stub —
 * same graceful-skip pattern as the platform-admin bootstrap.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

import type { NotifyChannel } from '../notification.types';
import type {
  NotificationProvider,
  ProviderSendRequest,
  ProviderSendResult,
} from './notification-provider';

@Injectable()
export class GmailNotificationProvider implements NotificationProvider {
  private readonly logger = new Logger('NotificationProvider:gmail');
  private readonly transporter: Transporter | null;
  private readonly fromAddress: string | null;

  readonly name = 'gmail';
  readonly channels: readonly NotifyChannel[] = ['email'];
  readonly requiresDltTemplate = false;
  readonly isStub: boolean;

  constructor(config: ConfigService) {
    const user = config.get<string>('GMAIL_USER')?.trim() || null;
    const pass = config.get<string>('GMAIL_APP_PASSWORD')?.trim() || null;
    if (!user || !pass) {
      this.transporter = null;
      this.fromAddress = null;
      this.isStub = true;
      return;
    }

    this.fromAddress = user;
    this.isStub = false;
    this.transporter = createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user, pass },
    });
  }

  get isConfigured(): boolean {
    return !this.isStub && !!this.transporter;
  }

  async send(req: ProviderSendRequest): Promise<ProviderSendResult> {
    if (req.channel !== 'email') {
      return {
        status: 'failed',
        providerRef: null,
        costPaise: 0,
        failureReason: `Gmail provider does not handle ${req.channel}`,
      };
    }
    if (!this.transporter || !this.fromAddress) {
      return {
        status: 'failed',
        providerRef: null,
        costPaise: 0,
        failureReason: 'Gmail SMTP is not configured',
      };
    }

    try {
      const info = await this.transporter.sendMail({
        from: `School All Ways <${this.fromAddress}>`,
        to: req.to,
        subject: req.subject?.trim() || 'School All Ways',
        text: req.body,
      });
      return {
        status: 'sent',
        providerRef: info.messageId ?? `gmail-${Date.now()}`,
        costPaise: 0,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Gmail send failed: ${message}`);
      return {
        status: 'failed',
        providerRef: null,
        costPaise: 0,
        failureReason: message,
      };
    }
  }
}

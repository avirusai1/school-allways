/**
 * The provider used until a real gateway is contracted.
 *
 * It writes the message it would have sent to the log and reports success, so
 * the delivery ledger, the escalation ladder and the read-receipt counters all
 * exercise their real code paths in development and in a pilot where the school
 * is watching the app rather than their SMS inbox.
 *
 * It reports cost zero. Nothing was bought, and a fabricated cost would flow
 * straight into the per-school comms spend figure we show the school.
 */

import { Injectable, Logger } from '@nestjs/common';

import type { NotifyChannel } from '../notification.types';
import type {
  NotificationProvider,
  ProviderSendRequest,
  ProviderSendResult,
} from './notification-provider';

@Injectable()
export class LoggingNotificationProvider implements NotificationProvider {
  private readonly logger = new Logger('NotificationProvider:log');

  readonly name = 'log';
  readonly channels: readonly NotifyChannel[] = [
    'push',
    'in_app',
    'sms',
    'whatsapp',
    'email',
  ];
  readonly requiresDltTemplate = false;
  readonly isStub = true;

  async send(req: ProviderSendRequest): Promise<ProviderSendResult> {
    this.logger.log(
      `[${req.channel}] -> ${maskRecipient(req.channel, req.to)} ` +
        `(${req.templateCode}): ${req.body.replace(/\s+/g, ' ').trim()}`,
    );
    return {
      status: 'sent',
      providerRef: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      costPaise: 0,
    };
  }
}

/**
 * Logs are read by more people than the database is, and a school's parent
 * phone list is exactly the kind of thing that should not sit in them.
 */
function maskRecipient(channel: NotifyChannel, to: string): string {
  if (channel === 'push') return `device:${to.slice(0, 8)}…`;
  if (channel === 'email') {
    const [user, domain] = to.split('@');
    return `${user?.slice(0, 2) ?? ''}…@${domain ?? ''}`;
  }
  return to.length > 4 ? `${'*'.repeat(to.length - 4)}${to.slice(-4)}` : to;
}

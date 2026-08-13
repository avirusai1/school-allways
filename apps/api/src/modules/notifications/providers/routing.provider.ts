/**
 * Picks a provider per channel. Prefer a non-stub that claims the channel
 * (Gmail for email when configured); otherwise fall back to the logging stub
 * so unpaid channels keep exercising the ledger honestly.
 */

import type { NotifyChannel } from '../notification.types';
import type {
  NotificationProvider,
  ProviderSendRequest,
  ProviderSendResult,
} from './notification-provider';

export class RoutingNotificationProvider implements NotificationProvider {
  readonly name = 'routing';
  readonly requiresDltTemplate = false;

  constructor(private readonly providers: NotificationProvider[]) {}

  get channels(): readonly NotifyChannel[] {
    return [...new Set(this.providers.flatMap((p) => [...p.channels]))];
  }

  get isStub(): boolean {
    return this.providers.every((p) => p.isStub);
  }

  pick(channel: NotifyChannel): NotificationProvider | null {
    const candidates = this.providers.filter((p) => p.channels.includes(channel));
    if (candidates.length === 0) return null;
    return candidates.find((p) => !p.isStub) ?? candidates[0]!;
  }

  async send(req: ProviderSendRequest): Promise<ProviderSendResult> {
    const provider = this.pick(req.channel);
    if (!provider) {
      return {
        status: 'failed',
        providerRef: null,
        costPaise: 0,
        failureReason: `No provider registered for ${req.channel}`,
      };
    }
    return provider.send(req);
  }
}

/**
 * The seam between "we decided to send this" and "a carrier took it".
 *
 * Everything above this interface — the ladder, quiet hours, the SMS cap, the
 * delivery ledger — is our logic and is testable without a provider account.
 * Everything below it is somebody else's API. Keeping the boundary explicit is
 * what lets the pilot run on a logging provider while the MSG91/FCM contracts
 * are still being signed, without the rest of the system pretending messages
 * were delivered.
 */

import type { NotifyChannel } from '../notification.types';

export const NOTIFICATION_PROVIDER = Symbol('NOTIFICATION_PROVIDER');

export interface ProviderSendRequest {
  channel: NotifyChannel;
  /** Phone in E.164 for sms/whatsapp, email address for email, FCM token for push. */
  to: string;
  body: string;
  subject: string | null;
  templateCode: string;
  /** TRAI DLT id. Present only for SMS, and only when the template carries one. */
  dltTemplateId: string | null;
  dltEntityId: string | null;
  /**
   * School the token belongs to. FCM uses this to deactivate a dead token
   * under RLS; omit and invalidation is skipped (logged).
   */
  tenantId?: string;
  /** FCM data payload — string values only. Ignored by email/SMS providers. */
  data?: Record<string, string>;
}

export interface ProviderSendResult {
  status: 'sent' | 'failed';
  providerRef: string | null;
  /** Paise. Lets a school see its own comms spend without a provider login. */
  costPaise: number;
  failureReason?: string;
}

export interface NotificationProvider {
  /** Stored on delivery_attempts.provider_name — must survive a provider swap. */
  readonly name: string;
  /** Channels this provider will accept; anything else is skipped, not failed. */
  readonly channels: readonly NotifyChannel[];
  /**
   * Real Indian SMS gateways reject transactional traffic without a registered
   * DLT template, so the check belongs to the provider rather than the caller.
   * A provider that never touches a carrier has no such constraint.
   */
  readonly requiresDltTemplate: boolean;
  /** True when nothing actually leaves the building. Surfaced at boot. */
  readonly isStub: boolean;

  send(req: ProviderSendRequest): Promise<ProviderSendResult>;
}

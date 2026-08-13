/**
 * Shared notification vocabulary. Lives apart from the service so providers and
 * processors can import it without pulling the service (and its Redis queue)
 * into their dependency graph.
 */

export type NotifyPriority = 'low' | 'normal' | 'high' | 'critical';
export type NotifyChannel = 'push' | 'in_app' | 'sms' | 'whatsapp' | 'email';

export interface NotifyRecipient {
  userId: string;
  studentId?: string;
  /**
   * Merged over the request-level variables. Invitations need a per-person
   * deep link, and without this every recipient would need its own notify()
   * call — 400 queue writes to tell 400 parents the same thing.
   */
  variables?: Record<string, string>;
}

export interface NotifyRequest {
  tenantId: string;
  templateCode: string;
  recipients: NotifyRecipient[];
  variables?: Record<string, string>;
  priority?: NotifyPriority;
  channels?: NotifyChannel[];
  scheduledFor?: Date | null;
  announcementId?: string;
  messageId?: string;
}

/** The shape put on the BullMQ queue — dates flattened for JSON transport. */
export interface NotificationFanOutJob
  extends Omit<NotifyRequest, 'scheduledFor' | 'channels' | 'priority' | 'variables'> {
  channels: NotifyChannel[];
  priority: NotifyPriority;
  variables: Record<string, string>;
  scheduledFor: string | null;
}

/**
 * Channels that cost money per message. The ladder tries them in this order and
 * stops at the first success, so a school is never billed twice for telling one
 * parent one thing.
 */
export const PAID_CHANNELS: readonly NotifyChannel[] = ['whatsapp', 'sms'];

export function isPaidChannel(channel: NotifyChannel): boolean {
  return PAID_CHANNELS.includes(channel);
}

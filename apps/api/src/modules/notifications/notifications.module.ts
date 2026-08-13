import { Global, Module, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationInboxController } from './notification-inbox.controller';
import { NotificationInboxService } from './notification-inbox.service';
import { NotificationService } from './notification.service';
import { NotificationFanOutProcessor } from './processors/notification-fanout.processor';
import { FcmNotificationProvider } from './providers/fcm.provider';
import { GmailNotificationProvider } from './providers/gmail.provider';
import { LoggingNotificationProvider } from './providers/logging.provider';
import {
  NOTIFICATION_PROVIDER,
  type NotificationProvider,
} from './providers/notification-provider';
import { RoutingNotificationProvider } from './providers/routing.provider';

/**
 * Provider selection is config-driven. Email prefers Gmail when
 * GMAIL_USER + GMAIL_APP_PASSWORD are set; push prefers FCM when the three
 * FCM_* values are set. Uncontracted channels (SMS, WhatsApp) stay on the
 * logging stub.
 */
const providerFactory = {
  provide: NOTIFICATION_PROVIDER,
  inject: [
    ConfigService,
    LoggingNotificationProvider,
    GmailNotificationProvider,
    FcmNotificationProvider,
  ],
  useFactory: (
    config: ConfigService,
    log: LoggingNotificationProvider,
    gmail: GmailNotificationProvider,
    fcm: FcmNotificationProvider,
  ): NotificationProvider => {
    const providers: NotificationProvider[] = [log];
    if (gmail.isConfigured) {
      providers.unshift(gmail);
      new Logger('NotificationsModule').log(
        'Gmail SMTP configured — email channel uses the real mailbox.',
      );
    } else {
      new Logger('NotificationsModule').warn(
        'GMAIL_USER / GMAIL_APP_PASSWORD unset — email falls back to the logging stub.',
      );
    }
    if (fcm.isConfigured) {
      providers.unshift(fcm);
      new Logger('NotificationsModule').log(
        'FCM configured — push channel uses Firebase Cloud Messaging.',
      );
    } else {
      new Logger('NotificationsModule').warn(
        'FCM_PROJECT_ID / FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY unset — push falls back to the logging stub.',
      );
    }

    const name = config.get<string>('NOTIFICATION_PROVIDER') ?? 'log';
    if (name !== 'log') {
      new Logger('NotificationsModule').warn(
        `NOTIFICATION_PROVIDER='${name}' is reserved; unpaid channels still use the logging provider.`,
      );
    }

    return new RoutingNotificationProvider(providers);
  },
};

@Global()
@Module({
  controllers: [NotificationInboxController],
  providers: [
    LoggingNotificationProvider,
    GmailNotificationProvider,
    FcmNotificationProvider,
    providerFactory,
    NotificationService,
    NotificationDispatchService,
    NotificationInboxService,
    NotificationFanOutProcessor,
  ],
  exports: [NotificationService, NotificationDispatchService, NOTIFICATION_PROVIDER],
})
export class NotificationsModule {}

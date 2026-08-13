import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { LoggingNotificationProvider } from './logging.provider';
import { FcmNotificationProvider } from './fcm.provider';
import { RoutingNotificationProvider } from './routing.provider';
import type { NotificationProvider } from './notification-provider';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const db = { asTenant: async () => undefined };

/**
 * Mirrors notifications.module.ts: FCM is unshifted only when configured,
 * otherwise push stays on the logging stub.
 */
function assemble(fcm: FcmNotificationProvider): RoutingNotificationProvider {
  const log = new LoggingNotificationProvider();
  const providers: NotificationProvider[] = [log];
  if (fcm.isConfigured) providers.unshift(fcm);
  return new RoutingNotificationProvider(providers);
}

describe('RoutingNotificationProvider push selection', () => {
  it('picks fcm for push when FCM env is fully present', () => {
    const fcm = new FcmNotificationProvider(
      {
        get: (key: string) =>
          ({
            FCM_PROJECT_ID: 'saw-pilot',
            FCM_CLIENT_EMAIL: 'fcm@saw-pilot.iam.gserviceaccount.com',
            FCM_PRIVATE_KEY: privateKey,
          })[key],
      } as never,
      db as never,
    );
    const routing = assemble(fcm);
    expect(routing.pick('push')?.name).toBe('fcm');
    expect(routing.pick('push')?.isStub).toBe(false);
  });

  it('falls back to the logging stub when FCM env is absent', () => {
    const fcm = new FcmNotificationProvider(
      { get: () => undefined } as never,
      db as never,
    );
    const routing = assemble(fcm);
    expect(fcm.isConfigured).toBe(false);
    expect(routing.pick('push')?.name).toBe('log');
    expect(routing.pick('push')?.isStub).toBe(true);
  });
});

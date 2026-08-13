import { generateKeyPairSync } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FcmNotificationProvider, isDeadToken } from './fcm.provider';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function configWith(values: Record<string, string | undefined>) {
  return {
    get: (key: string) => values[key],
  };
}

const FULL_ENV = {
  FCM_PROJECT_ID: 'saw-pilot',
  FCM_CLIENT_EMAIL: 'fcm@saw-pilot.iam.gserviceaccount.com',
  FCM_PRIVATE_KEY: privateKey,
};

describe('isDeadToken', () => {
  it('treats UNREGISTERED / NOT_FOUND as dead', () => {
    expect(
      isDeadToken(404, {
        error: {
          status: 'NOT_FOUND',
          details: [{ errorCode: 'UNREGISTERED' }],
        },
      }),
    ).toBe(true);
  });

  it('treats INVALID_ARGUMENT as dead', () => {
    expect(
      isDeadToken(400, {
        error: {
          status: 'INVALID_ARGUMENT',
          details: [{ errorCode: 'INVALID_ARGUMENT' }],
        },
      }),
    ).toBe(true);
  });

  it('does not treat 503 as a dead token', () => {
    expect(isDeadToken(503, { error: { status: 'UNAVAILABLE' } })).toBe(false);
  });
});

describe('FcmNotificationProvider', () => {
  let deactivated: string[];
  let db: { asTenant: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    deactivated = [];
    db = {
      asTenant: vi.fn(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          update: () => ({
            set: () => ({
              where: async () => {
                deactivated.push('called');
              },
            }),
          }),
        }),
      ),
    };
  });

  it('treats blank FCM env as unset and does not half-initialise', () => {
    const provider = new FcmNotificationProvider(
      configWith({
        FCM_PROJECT_ID: 'saw-pilot',
        FCM_CLIENT_EMAIL: 'fcm@saw-pilot.iam.gserviceaccount.com',
        FCM_PRIVATE_KEY: '   ',
      }) as never,
      db as never,
    );
    expect(provider.isConfigured).toBe(false);
    expect(provider.isStub).toBe(true);
  });

  it('returns providerRef on a successful send', async () => {
    const provider = new FcmNotificationProvider(configWith(FULL_ENV) as never, db as never);
    const urls: string[] = [];
    provider.fetchFn = (async (input: string | URL | Request, _init?: RequestInit) => {
      const url = String(input);
      urls.push(url);
      if (url.includes('oauth2.googleapis.com')) {
        return jsonResponse(200, { access_token: 'ya29.cached', expires_in: 3600 });
      }
      return jsonResponse(200, { name: 'projects/saw-pilot/messages/abc123' });
    }) as typeof fetch;

    const res = await provider.send({
      channel: 'push',
      to: 'token-live',
      body: 'Aarav is absent today',
      subject: 'Absent',
      templateCode: 'STUDENT_ABSENT',
      dltTemplateId: null,
      dltEntityId: null,
      tenantId: 'tenant-1',
    });

    expect(res.status).toBe('sent');
    expect(res.providerRef).toBe('projects/saw-pilot/messages/abc123');
    expect(res.costPaise).toBe(0);
    expect(deactivated).toHaveLength(0);
    expect(urls.some((u) => u.includes('messages:send'))).toBe(true);
  });

  it('deactivates only the dead token on UNREGISTERED', async () => {
    const provider = new FcmNotificationProvider(configWith(FULL_ENV) as never, db as never);
    const seenTokens: string[] = [];
    provider.fetchFn = (async (input: string | URL | Request, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes('oauth2.googleapis.com')) {
        return jsonResponse(200, { access_token: 'ya29.x', expires_in: 3600 });
      }
      const body = JSON.parse(String(_init?.body ?? '{}')) as {
        message?: { token?: string };
      };
      seenTokens.push(body.message?.token ?? '');
      return jsonResponse(404, {
        error: {
          status: 'NOT_FOUND',
          details: [{ errorCode: 'UNREGISTERED' }],
        },
      });
    }) as typeof fetch;

    const res = await provider.send({
      channel: 'push',
      to: 'token-dead',
      body: 'body',
      subject: 'title',
      templateCode: 'STUDENT_ABSENT',
      dltTemplateId: null,
      dltEntityId: null,
      tenantId: 'tenant-1',
    });

    expect(res.status).toBe('failed');
    expect(seenTokens).toEqual(['token-dead']);
    expect(db.asTenant).toHaveBeenCalledTimes(1);
    expect(db.asTenant).toHaveBeenCalledWith('tenant-1', expect.any(Function));
    expect(deactivated).toEqual(['called']);
  });

  it('does not deactivate on a 503 and reports failure so the ladder can retry', async () => {
    const provider = new FcmNotificationProvider(configWith(FULL_ENV) as never, db as never);
    provider.fetchFn = (async (input: string | URL | Request, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes('oauth2.googleapis.com')) {
        return jsonResponse(200, { access_token: 'ya29.x', expires_in: 3600 });
      }
      return jsonResponse(503, { error: { status: 'UNAVAILABLE' } });
    }) as typeof fetch;

    const res = await provider.send({
      channel: 'push',
      to: 'token-live',
      body: 'body',
      subject: 'title',
      templateCode: 'STUDENT_ABSENT',
      dltTemplateId: null,
      dltEntityId: null,
      tenantId: 'tenant-1',
    });

    expect(res.status).toBe('failed');
    expect(res.failureReason).toContain('503');
    expect(db.asTenant).not.toHaveBeenCalled();
    expect(deactivated).toHaveLength(0);
  });

  it('caches the Google access token across sends', async () => {
    const provider = new FcmNotificationProvider(configWith(FULL_ENV) as never, db as never);
    let oauthCalls = 0;
    let fcmCalls = 0;
    provider.fetchFn = (async (input: string | URL | Request, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes('oauth2.googleapis.com')) {
        oauthCalls += 1;
        return jsonResponse(200, { access_token: 'ya29.cached', expires_in: 3600 });
      }
      fcmCalls += 1;
      return jsonResponse(200, { name: `projects/saw-pilot/messages/${fcmCalls}` });
    }) as typeof fetch;

    const req = {
      channel: 'push' as const,
      to: 'token-live',
      body: 'body',
      subject: 'title',
      templateCode: 'STUDENT_ABSENT',
      dltTemplateId: null,
      dltEntityId: null,
      tenantId: 'tenant-1',
    };

    await provider.send(req);
    await provider.send(req);

    expect(oauthCalls).toBe(1);
    expect(fcmCalls).toBe(2);
  });
});

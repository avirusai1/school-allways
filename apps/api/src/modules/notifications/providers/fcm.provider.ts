/**
 * FCM HTTP v1 push. No firebase-admin SDK — that package pulls gRPC and a
 * credential stack we do not need for one POST per message on a 2 vCPU box.
 *
 * Access tokens are minted from the service-account key and cached until
 * shortly before expiry. Empty FCM_* env values are treated as unset so a
 * blank key cannot half-initialise a provider that then fails per message.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPrivateKey, createSign } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { deviceTokens } from '@saw/db';

import { TenantDbService } from '../../../common/database/tenant-db.service';
import type { NotifyChannel } from '../notification.types';
import { routeForTemplate } from '../push-route.util';
import type {
  NotificationProvider,
  ProviderSendRequest,
  ProviderSendResult,
} from './notification-provider';

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REFRESH_SKEW_MS = 60_000;

type FetchFn = typeof fetch;

@Injectable()
export class FcmNotificationProvider implements NotificationProvider {
  private readonly logger = new Logger('NotificationProvider:fcm');
  private readonly projectId: string | null;
  private readonly clientEmail: string | null;
  private readonly privateKey: string | null;
  private cached: { token: string; expiresAt: number } | null = null;

  /** Overridable in unit tests so we never hit Google. */
  fetchFn: FetchFn = globalThis.fetch.bind(globalThis);

  readonly name = 'fcm';
  readonly channels: readonly NotifyChannel[] = ['push'];
  readonly requiresDltTemplate = false;
  readonly isStub: boolean;

  constructor(
    config: ConfigService,
    private readonly db: TenantDbService,
  ) {
    const projectId = config.get<string>('FCM_PROJECT_ID')?.trim() || null;
    const clientEmail = config.get<string>('FCM_CLIENT_EMAIL')?.trim() || null;
    const rawKey = config.get<string>('FCM_PRIVATE_KEY')?.trim() || null;
    const privateKey = rawKey ? normalisePem(rawKey) : null;

    if (!projectId || !clientEmail || !privateKey) {
      this.projectId = null;
      this.clientEmail = null;
      this.privateKey = null;
      this.isStub = true;
      return;
    }

    this.projectId = projectId;
    this.clientEmail = clientEmail;
    this.privateKey = privateKey;
    this.isStub = false;
  }

  get isConfigured(): boolean {
    return !this.isStub && !!this.projectId && !!this.clientEmail && !!this.privateKey;
  }

  async send(req: ProviderSendRequest): Promise<ProviderSendResult> {
    if (req.channel !== 'push') {
      return {
        status: 'failed',
        providerRef: null,
        costPaise: 0,
        failureReason: `FCM provider does not handle ${req.channel}`,
      };
    }
    if (!this.isConfigured || !this.projectId) {
      return {
        status: 'failed',
        providerRef: null,
        costPaise: 0,
        failureReason: 'FCM is not configured',
      };
    }

    let accessToken: string;
    try {
      accessToken = await this.getAccessToken();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`FCM access token failed: ${message}`);
      return { status: 'failed', providerRef: null, costPaise: 0, failureReason: message };
    }

    const url = `https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`;
    const data: Record<string, string> = {
      templateCode: req.templateCode,
      route: routeForTemplate(req.templateCode),
      ...(req.data ?? {}),
    };

    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: req.to,
            notification: {
              title: req.subject?.trim() || 'School All Ways',
              body: req.body,
            },
            data,
            android: { priority: 'HIGH' },
          },
        }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: 'failed', providerRef: null, costPaise: 0, failureReason: message };
    }

    if (res.ok) {
      const body = (await res.json().catch(() => ({}))) as { name?: string };
      return {
        status: 'sent',
        providerRef: body.name ?? `fcm-${Date.now()}`,
        costPaise: 0,
      };
    }

    const errBody = await res.json().catch(() => ({}));
    const dead = isDeadToken(res.status, errBody);
    if (dead) {
      await this.deactivateToken(req.to, req.tenantId);
      return {
        status: 'failed',
        providerRef: null,
        costPaise: 0,
        failureReason: `FCM token invalid (${res.status})`,
      };
    }

    const reason = `FCM HTTP ${res.status}`;
    this.logger.error(`FCM send failed: ${reason}`);
    return { status: 'failed', providerRef: null, costPaise: 0, failureReason: reason };
  }

  private async getAccessToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt > Date.now() + REFRESH_SKEW_MS) {
      return this.cached.token;
    }
    if (!this.clientEmail || !this.privateKey) {
      throw new Error('FCM service account is not configured');
    }

    const now = Math.floor(Date.now() / 1000);
    const assertion = signJwt(
      { alg: 'RS256', typ: 'JWT' },
      {
        iss: this.clientEmail,
        sub: this.clientEmail,
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600,
        scope: FCM_SCOPE,
      },
      this.privateKey,
    );

    const res = await this.fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    });
    if (!res.ok) {
      throw new Error(`Google OAuth ${res.status}`);
    }
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) {
      throw new Error('Google OAuth response missing access_token');
    }
    const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 3600;
    this.cached = {
      token: body.access_token,
      expiresAt: Date.now() + expiresIn * 1000,
    };
    return this.cached.token;
  }

  private async deactivateToken(fcmToken: string, tenantId: string | undefined): Promise<void> {
    if (!tenantId) {
      this.logger.warn(
        `FCM token is dead but tenantId was not on the send request; leaving device_tokens row active.`,
      );
      return;
    }
    try {
      await this.db.asTenant(tenantId, async (tx) => {
        await tx
          .update(deviceTokens)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(deviceTokens.fcmToken, fcmToken));
      });
    } catch (err) {
      this.logger.error(
        `Failed to deactivate dead FCM token: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

export { routeForTemplate };

export function isDeadToken(httpStatus: number, body: unknown): boolean {
  if (httpStatus !== 400 && httpStatus !== 404) return false;
  const err = body as {
    error?: { status?: string; details?: Array<{ errorCode?: string; '@type'?: string }> };
  };
  const status = err.error?.status ?? '';
  const codes = (err.error?.details ?? []).map((d) => d.errorCode ?? '');
  if (status === 'NOT_FOUND' || codes.includes('UNREGISTERED')) return true;
  if (status === 'INVALID_ARGUMENT' || codes.includes('INVALID_ARGUMENT')) return true;
  return false;
}

function normalisePem(raw: string): string {
  return raw.replace(/\\n/g, '\n').replace(/^"|"$/g, '');
}

function signJwt(
  header: Record<string, string>,
  payload: Record<string, unknown>,
  pem: string,
): string {
  const enc = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = `${enc(header)}.${enc(payload)}`;
  const key = createPrivateKey(pem);
  const sig = createSign('RSA-SHA256').update(unsigned).end().sign(key, 'base64url');
  return `${unsigned}.${sig}`;
}

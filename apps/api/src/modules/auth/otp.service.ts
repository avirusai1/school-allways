import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { and, desc, eq, inArray } from 'drizzle-orm';

import { userTenantMemberships } from '@saw/db';

import { ApiException } from '../../common/errors/api.exception';
import { TenantDbService } from '../../common/database/tenant-db.service';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import { generateOtpCode, sha256 } from '../../common/utils/crypto.util';
import { maskPhone } from '../../common/utils/phone.util';
import { NotificationDispatchService } from '../notifications/notification-dispatch.service';
import { NotificationService } from '../notifications/notification.service';
import { AuthRepository } from './auth.repository';

const RESEND_AFTER_SECONDS = 60;
const PHONE_LIMIT = 3;
const PHONE_WINDOW_SECONDS = 15 * 60;
const IP_LIMIT = 10;
const IP_WINDOW_SECONDS = 3600;

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly db: TenantDbService,
    private readonly repo: AuthRepository,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Optional() private readonly notifications?: NotificationService,
    @Optional() private readonly dispatch?: NotificationDispatchService,
  ) {}

  async requestOtp(params: {
    phone?: string;
    email?: string;
    purpose: string;
    requestIp?: string;
    /** Override delivery address (signup has email before a user row exists). */
    deliverToEmail?: string | null;
  }): Promise<{ code: string; expiresInSeconds: number; resendAfterSeconds: number }> {
    const phone = params.phone?.trim() || undefined;
    const email = params.email?.trim().toLowerCase() || undefined;
    if (!phone && !email) {
      throw new ApiException(
        400,
        'VALIDATION_FAILED',
        'Provide a mobile number or an email address.',
      );
    }

    await this.enforceRateLimits(phone ?? email!, params.requestIp);

    const ttl = this.config.get<number>('OTP_TTL_SECONDS') ?? 300;
    const expiresAt = new Date(Date.now() + ttl * 1000);
    const code = generateOtpCode();
    const codeHash = sha256(code);

    const resolved = await this.db.runUnscoped(async (tx) => {
      const user = email
        ? await this.repo.findUserByEmail(tx, email)
        : phone
          ? await this.repo.findUserByPhone(tx, phone)
          : null;

      const storePhone = phone ?? user?.phone ?? null;
      const storeEmail = email ?? user?.email ?? params.deliverToEmail ?? null;

      await this.repo.invalidateOtps(tx, {
        phone: storePhone,
        email: storeEmail,
        purpose: params.purpose,
      });
      await this.repo.insertOtp(tx, {
        userId: user?.id ?? null,
        phone: storePhone,
        email: storeEmail,
        purpose: params.purpose,
        codeHash,
        expiresAt,
        requestIp: params.requestIp,
      });

      return { user, storePhone, storeEmail };
    });

    // Prefer email whenever we have one — it's the funded channel. Phone/SMS
    // stays as a logging-stub path until a paid gateway exists.
    const deliveryEmail =
      params.deliverToEmail?.trim().toLowerCase() ||
      resolved.storeEmail ||
      resolved.user?.email ||
      null;

    await this.deliverCode({
      code,
      purpose: params.purpose,
      userId: resolved.user?.id ?? null,
      phone: resolved.storePhone,
      email: deliveryEmail,
    });

    return {
      code,
      expiresInSeconds: ttl,
      resendAfterSeconds: RESEND_AFTER_SECONDS,
    };
  }

  async verifyOtp(params: {
    phone?: string;
    email?: string;
    purpose: string;
    code: string;
  }): Promise<void> {
    const phone = params.phone?.trim() || undefined;
    const email = params.email?.trim().toLowerCase() || undefined;
    if (!phone && !email) {
      throw new ApiException(
        400,
        'VALIDATION_FAILED',
        'Provide a mobile number or an email address.',
      );
    }

    const maxAttempts = this.config.get<number>('OTP_MAX_ATTEMPTS') ?? 5;

    await this.db.runUnscoped(async (tx) => {
      const otp = await this.repo.findLatestOtp(tx, {
        phone,
        email,
        purpose: params.purpose,
      });

      if (!otp || otp.consumedAt || otp.expiresAt < new Date()) {
        throw new ApiException(401, 'OTP_INVALID', 'The code is incorrect or has expired.');
      }

      if (otp.attemptCount >= maxAttempts) {
        await this.repo.consumeOtp(tx, otp.id);
        throw new ApiException(401, 'OTP_INVALID', 'The code is incorrect or has expired.');
      }

      const nextAttempts = otp.attemptCount + 1;
      if (sha256(params.code) !== otp.codeHash) {
        await this.repo.incrementOtpAttempts(tx, otp.id, nextAttempts);
        if (nextAttempts >= maxAttempts) {
          await this.repo.consumeOtp(tx, otp.id);
        }
        throw new ApiException(401, 'OTP_INVALID', 'The code is incorrect or has expired.');
      }

      await this.repo.consumeOtp(tx, otp.id);
    });
  }

  /**
   * Was a gap: requestOtp only logged. Prefer NotificationService.notify (ledger
   * + quiet-hours + worker) when we have a user and tenant; otherwise sendDirect
   * through the same provider router (Gmail or log stub) for signup OTPs that
   * exist before a user row.
   */
  private async deliverCode(params: {
    code: string;
    purpose: string;
    userId: string | null;
    phone: string | null;
    email: string | null;
  }): Promise<void> {
    const channel = params.email ? 'email' : 'sms';
    const to = params.email ?? params.phone;
    if (!to) {
      this.logger.warn(`OTP ${params.purpose} stored but no delivery address`);
      return;
    }

    if (params.userId && this.notifications) {
      const tenantId = await this.firstMembershipTenant(params.userId);
      if (tenantId) {
        try {
          await this.notifications.notify({
            tenantId,
            templateCode: 'OTP_LOGIN',
            recipients: [{ userId: params.userId }],
            variables: { code: params.code, purpose: params.purpose },
            priority: 'critical',
            channels: [channel],
          });
          this.logger.log(
            `OTP queued via notify ${channel} for ${channel === 'email' ? maskEmail(to) : maskPhone(to)} purpose=${params.purpose}`,
          );
          return;
        } catch (err) {
          this.logger.error(
            `OTP notify failed, falling back to direct send: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    }

    if (this.dispatch) {
      const subject =
        channel === 'email' ? 'Your School All Ways verification code' : null;
      const body =
        channel === 'email'
          ? `Your verification code is ${params.code}. It expires in a few minutes. If you did not request this, ignore this email.`
          : `School All Ways code: ${params.code}`;
      const result = await this.dispatch.sendDirect({
        channel,
        to,
        body,
        subject,
        templateCode: 'OTP_LOGIN',
      });
      this.logger.log(
        `OTP direct ${result.status} via ${result.providerName} ` +
          `${channel === 'email' ? maskEmail(to) : maskPhone(to)} purpose=${params.purpose}`,
      );
      return;
    }

    // Tests / early boot without the notifications module injected.
    if (this.config.get('NODE_ENV') === 'development') {
      this.logger.log(
        `OTP for ${channel === 'email' ? maskEmail(to) : maskPhone(to)} purpose=${params.purpose} (dev only, no provider)`,
      );
    }
  }

  private async firstMembershipTenant(userId: string): Promise<string | null> {
    return this.db.runAsActingUser(userId, async (tx) => {
      const [row] = await tx
        .select({ tenantId: userTenantMemberships.tenantId })
        .from(userTenantMemberships)
        .where(
          and(
            eq(userTenantMemberships.userId, userId),
            inArray(userTenantMemberships.status, ['active', 'invited']),
          ),
        )
        .orderBy(desc(userTenantMemberships.createdAt))
        .limit(1);
      return row?.tenantId ?? null;
    });
  }

  private async enforceRateLimits(key: string, ip?: string): Promise<void> {
    const phoneKey = `otp:id:${key}`;
    const phoneCount = await this.redis.incr(phoneKey);
    if (phoneCount === 1) await this.redis.expire(phoneKey, PHONE_WINDOW_SECONDS);
    if (phoneCount > PHONE_LIMIT) {
      const retryAfter = await this.redis.ttl(phoneKey);
      throw new ApiException(429, 'RATE_LIMITED', 'Too many OTP requests. Please wait.', {
        retryAfterSeconds: Math.max(retryAfter, 1),
      });
    }

    if (ip) {
      const ipKey = `otp:ip:${ip}`;
      const ipCount = await this.redis.incr(ipKey);
      if (ipCount === 1) await this.redis.expire(ipKey, IP_WINDOW_SECONDS);
      if (ipCount > IP_LIMIT) {
        const retryAfter = await this.redis.ttl(ipKey);
        throw new ApiException(429, 'RATE_LIMITED', 'Too many OTP requests. Please wait.', {
          retryAfterSeconds: Math.max(retryAfter, 1),
        });
      }
    }
  }
}

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  return `${user?.slice(0, 2) ?? ''}…@${domain ?? ''}`;
}

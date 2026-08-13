import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { and, eq } from 'drizzle-orm';

import { auditLogs, deviceTokens } from '@saw/db';
import { ApiException } from '../../common/errors/api.exception';
import { RequestContextStore } from '../../common/context/request-context';
import { TenantDbService } from '../../common/database/tenant-db.service';
import { publicFileUrl } from '../../common/utils/url.util';
import { normalizePhone } from '../import/import.util';
import { AuthRepository, type MembershipRow } from './auth.repository';
import { OtpService } from './otp.service';
import { SessionService } from './session.service';
import { TokenService } from './token.service';
import type { RegisterDeviceTokenDto } from './dto/device-token.dto';
import type { PasswordLoginDto } from './dto/password-login.dto';
import type { RequestOtpDto } from './dto/request-otp.dto';
import type { SelectTenantDto } from './dto/select-tenant.dto';
import type { VerifyOtpDto } from './dto/verify-otp.dto';
import type {
  AuthTokensResponseDto,
  AuthUserDto,
  MeResponseDto,
  PlatformSessionDto,
  RequestOtpResponseDto,
  SessionResponseDto,
  TenantSummaryDto,
} from './dto/auth.response';

const LOCK_THRESHOLD = 10;
const LOCK_MINUTES = 15;

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private dummyPasswordHash = '';

  constructor(
    private readonly config: ConfigService,
    private readonly db: TenantDbService,
    private readonly repo: AuthRepository,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly session: SessionService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyPasswordHash = await argon2.hash('dummy-password-not-real', {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  async requestOtp(dto: RequestOtpDto): Promise<RequestOtpResponseDto> {
    const ctx = RequestContextStore.peek();
    const result = await this.otp.requestOtp({
      phone: dto.phone,
      email: dto.email,
      purpose: dto.purpose,
      requestIp: ctx?.ip,
    });

    const response: RequestOtpResponseDto = {
      sent: true,
      expiresInSeconds: result.expiresInSeconds,
      resendAfterSeconds: result.resendAfterSeconds,
    };

    if (this.config.get('NODE_ENV') === 'development') {
      response.devOtp = result.code;
    }

    return response;
  }

  async verifyOtp(dto: VerifyOtpDto): Promise<AuthTokensResponseDto> {
    await this.otp.verifyOtp({
      phone: dto.phone,
      email: dto.email,
      purpose: dto.purpose,
      code: dto.code,
    });

    const ctx = RequestContextStore.peek();
    const user = await this.db.runUnscoped(async (tx) => {
      if (dto.email) return this.repo.findUserByEmail(tx, dto.email.trim().toLowerCase());
      if (dto.phone) return this.repo.findUserByPhone(tx, dto.phone);
      return null;
    });

    if (!user || !user.isActive) {
      throw new ApiException(
        401,
        'UNAUTHENTICATED',
        'No account found for this number. Contact your school to get access.',
      );
    }

    const memberships = await this.db.runAsActingUser(user.id, (tx) =>
      this.repo.listActiveMemberships(tx, user.id),
    );

    await this.assertReachableMembership(user, memberships);

    return this.issueAuthResponse(user, memberships, {
      deviceId: dto.deviceId,
      deviceName: dto.deviceName,
      platform: dto.platform,
      appVersion: dto.appVersion,
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
    });
  }

  async passwordLogin(dto: PasswordLoginDto): Promise<AuthTokensResponseDto> {
    const ctx = RequestContextStore.peek();
    const email = dto.email?.trim().toLowerCase();
    const phone = dto.phone ? normalizePhone(dto.phone) ?? dto.phone.trim() : undefined;
    if (!email && !phone) {
      throw new ApiException(
        400,
        'VALIDATION_FAILED',
        'Provide an email address or a mobile number.',
      );
    }

    const user = await this.db.runUnscoped(async (tx) => {
      if (email) return this.repo.findUserByEmail(tx, email);
      if (phone) return this.repo.findUserByPhone(tx, phone);
      return null;
    });

    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      throw new ApiException(401, 'UNAUTHENTICATED', 'Sign-in details are incorrect.', {
        lockedUntil: user.lockedUntil.toISOString(),
      });
    }

    const hash = user?.passwordHash ?? this.dummyPasswordHash;
    const valid = await argon2.verify(hash, dto.password);

    if (!user || !user.isActive || !user.passwordHash || !valid) {
      if (user) {
        const failed = user.failedLoginCount + 1;
        const lockedUntil =
          failed >= LOCK_THRESHOLD
            ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
            : null;
        await this.db.runUnscoped((tx) =>
          this.repo.incrementFailedLogins(tx, user.id, failed, lockedUntil),
        );
      }

      throw new ApiException(401, 'UNAUTHENTICATED', 'Sign-in details are incorrect.');
    }

    await this.db.runUnscoped((tx) => this.repo.updateUserLogin(tx, user.id));

    const memberships = await this.db.runAsActingUser(user.id, (tx) =>
      this.repo.listActiveMemberships(tx, user.id),
    );

    await this.assertReachableMembership(user, memberships);

    return this.issueAuthResponse(user, memberships, {
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
    });
  }

  async selectTenant(dto: SelectTenantDto): Promise<{ accessToken: string; expiresIn: number }> {
    const ctx = RequestContextStore.get();
    if (!ctx.userId || !ctx.sessionId) {
      throw new ApiException(401, 'UNAUTHENTICATED', 'Missing access token');
    }

    const membership = await this.db.runAsActingUser(ctx.userId, (tx) =>
      this.repo.findMembership(tx, ctx.userId!, dto.tenantId),
    );

    if (!membership) {
      await this.writeTenantMismatchAudit(ctx.userId, dto.tenantId, dto.branchId);
      throw new ApiException(
        403,
        'TENANT_MISMATCH',
        'You do not belong to this school.',
        { tenantId: dto.tenantId },
      );
    }

    const userForKind = await this.db.runUnscoped((tx) => this.repo.findUserById(tx, ctx.userId!));
    if (
      userForKind &&
      userForKind.kind !== 'guardian' &&
      userForKind.kind !== 'student' &&
      userForKind.kind !== 'platform' &&
      membership.tenantStatus === 'suspended'
    ) {
      throw new ApiException(
        403,
        'TENANT_SUSPENDED',
        'This school is temporarily suspended. Contact School All Ways support.',
      );
    }

    let branchId = dto.branchId ?? membership.branchId;
    if (branchId) {
      const branch = await this.db.runAsActingUser(ctx.userId, (tx) =>
        this.repo.findBranch(tx, branchId!),
      );
      if (!branch || branch.tenantId !== dto.tenantId) {
        await this.writeTenantMismatchAudit(ctx.userId, dto.tenantId, dto.branchId);
        throw new ApiException(
          403,
          'TENANT_MISMATCH',
          'You do not belong to this school.',
          { tenantId: dto.tenantId },
        );
      }
    } else {
      const memberships = await this.db.runAsActingUser(ctx.userId, (tx) =>
        this.repo.listActiveMemberships(tx, ctx.userId!),
      );
      branchId = memberships.find((m) => m.tenantId === dto.tenantId)?.branchId ?? null;
    }

    if (!branchId) {
      throw new ApiException(422, 'BUSINESS_RULE', 'No branch is available for this school.');
    }

    await this.db.runUnscoped((tx) =>
      this.repo.updateSessionTenant(tx, ctx.sessionId!, dto.tenantId, branchId),
    );

    const user = await this.db.runUnscoped((tx) => this.repo.findUserById(tx, ctx.userId!));
    const isPlatformAdmin =
      ctx.isPlatformAdmin || user?.kind === 'platform';

    const accessToken = this.tokens.signAccessToken({
      sub: ctx.userId,
      tid: dto.tenantId,
      bid: branchId,
      sid: ctx.sessionId,
      pa: isPlatformAdmin || undefined,
      imp: ctx.impersonatorUserId ?? undefined,
    });

    return { accessToken, expiresIn: this.tokens.accessExpiresIn };
  }

  async refresh(refreshToken: string) {
    try {
      return await this.tokens.rotateRefreshToken(refreshToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'TOKEN_REUSE') {
        this.logger.warn('Refresh token reuse detected — all sessions revoked');
        throw new ApiException(
          401,
          'UNAUTHENTICATED',
          'Your session was ended for security. Please sign in again.',
        );
      }
      throw new ApiException(401, 'UNAUTHENTICATED', 'Invalid or expired refresh token');
    }
  }

  async getSession(): Promise<SessionResponseDto> {
    const ctx = RequestContextStore.get();
    if (!ctx.userId || !ctx.tenantId || !ctx.branchId) {
      throw new ApiException(
        401,
        'UNAUTHENTICATED',
        'No school selected. Choose a school before calling this endpoint.',
      );
    }

    return this.session.buildSession(ctx.userId, ctx.tenantId, ctx.branchId);
  }

  async getPlatformSession(): Promise<PlatformSessionDto> {
    const ctx = RequestContextStore.get();
    if (!ctx.userId) {
      throw new ApiException(401, 'UNAUTHENTICATED', 'Missing access token');
    }
    return this.session.buildPlatformSession(ctx.userId);
  }

  async me(): Promise<MeResponseDto> {
    const ctx = RequestContextStore.get();
    if (!ctx.userId) {
      throw new ApiException(401, 'UNAUTHENTICATED', 'Missing access token');
    }

    const filesBaseUrl = this.config.getOrThrow<string>('FILES_BASE_URL');
    const [user, memberships] = await Promise.all([
      this.db.runUnscoped((tx) => this.repo.findUserById(tx, ctx.userId!)),
      this.db.runAsActingUser(ctx.userId!, (tx) =>
        this.repo.listActiveMemberships(tx, ctx.userId!),
      ),
    ]);

    if (!user) {
      throw new ApiException(401, 'UNAUTHENTICATED', 'Invalid or expired access token');
    }

    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        displayName: user.displayName,
        photoUrl: publicFileUrl(filesBaseUrl, user.avatarPath),
        preferredLanguage: user.preferredLanguage,
        kind: user.kind,
        isMinor: user.isMinor,
      },
      tenants: memberships.map((m) => this.toTenantSummary(m, filesBaseUrl)),
    };
  }

  async logout(): Promise<void> {
    const ctx = RequestContextStore.get();
    if (!ctx.sessionId || !ctx.userId) return;

    await this.db.runUnscoped(async (tx) => {
      await this.repo.revokeSession(tx, ctx.sessionId!, 'user_logout');
    });

    // RLS WITH CHECK requires a tenant on UPDATE. Unscoped logout cannot
    // see another school's rows; deactivate in the session's tenant, and
    // DELETE /auth/device-token handles the handset that is signing out.
    if (ctx.tenantId) {
      await this.db.run(async (tx) => {
        await tx
          .update(deviceTokens)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(deviceTokens.userId, ctx.userId!));
      });
    }
  }

  /**
   * Upsert on fcm_token, not user. One person has several devices, and FCM
   * reassigns a token string when someone else signs in on that handset —
   * reassigning ownership here is what stops family A's alerts landing on
   * family B's phone.
   */
  async registerDeviceToken(
    dto: RegisterDeviceTokenDto,
  ): Promise<{ registered: true }> {
    const ctx = RequestContextStore.get();
    if (!ctx.userId) {
      throw new ApiException(401, 'UNAUTHENTICATED', 'Sign in to register this device.');
    }
    if (!ctx.tenantId) {
      throw new ApiException(
        422,
        'NO_TENANT',
        'Choose a school before registering this device for notifications.',
      );
    }

    const now = new Date();
    await this.db.run(async (tx) => {
      await tx
        .insert(deviceTokens)
        .values({
          userId: ctx.userId!,
          tenantId: ctx.tenantId,
          fcmToken: dto.fcmToken,
          platform: dto.platform,
          appId: dto.appId,
          deviceId: dto.deviceId ?? null,
          isActive: true,
          lastSeenAt: now,
        })
        .onConflictDoUpdate({
          target: deviceTokens.fcmToken,
          set: {
            userId: ctx.userId!,
            tenantId: ctx.tenantId,
            platform: dto.platform,
            appId: dto.appId,
            deviceId: dto.deviceId ?? null,
            isActive: true,
            lastSeenAt: now,
            updatedAt: now,
          },
        });
    });

    RequestContextStore.addAudit({
      action: 'auth.device_token.register',
      entityType: 'device_tokens',
      changes: {
        appId: { from: null, to: dto.appId },
        platform: { from: null, to: dto.platform },
      },
    });

    return { registered: true };
  }

  async unregisterDeviceToken(fcmToken: string): Promise<void> {
    const ctx = RequestContextStore.get();
    if (!ctx.userId || !ctx.tenantId) return;

    const now = new Date();
    await this.db.run(async (tx) => {
      await tx
        .update(deviceTokens)
        .set({ isActive: false, updatedAt: now })
        .where(and(eq(deviceTokens.fcmToken, fcmToken), eq(deviceTokens.userId, ctx.userId!)));
    });
  }

  /**
   * Issue a session for a user whose identity has already been established by
   * some other means. Today that means a join link: tapping a URL that only
   * the phone the school has on file could have received is the same class of
   * proof as reading an OTP off that phone, so making them then type a code
   * would be ceremony, not security.
   *
   * Deliberately narrow — it performs no verification of its own. The caller
   * owns that, and there should be very few callers.
   */
  async issueSessionForVerifiedUser(userId: string): Promise<AuthTokensResponseDto> {
    const ctx = RequestContextStore.peek();
    const user = await this.db.runUnscoped((tx) => this.repo.findUserById(tx, userId));

    if (!user || !user.isActive) {
      throw new ApiException(
        401,
        'UNAUTHENTICATED',
        'This account is no longer active. Contact your school.',
      );
    }

    const memberships = await this.db.runAsActingUser(user.id, (tx) =>
      this.repo.listActiveMemberships(tx, user.id),
    );

    await this.assertReachableMembership(user, memberships);

    return this.issueAuthResponse(user, memberships, {
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
    });
  }

  /**
   * An imported parent is created with membership `invited` until they tap the
   * join link. OTP login only lists `active` memberships (correct — they must
   * not get a school session yet). Returning `requiresTenantSelection: true`
   * with an empty `tenants` array looked identical to an account error; refuse
   * the session and say why instead.
   *
   * Platform users may legitimately have zero school memberships.
   */
  private staffReachableMemberships(kind: string, memberships: MembershipRow[]): MembershipRow[] {
    if (kind === 'guardian' || kind === 'student' || kind === 'platform') return memberships;
    return memberships.filter((m) => m.tenantStatus !== 'suspended');
  }

  private async assertReachableMembership(
    user: { id: string; kind: string },
    memberships: MembershipRow[],
  ): Promise<void> {
    const reachable = this.staffReachableMemberships(user.kind, memberships);
    if (reachable.length > 0) return;
    if (user.kind === 'platform') return;

    if (memberships.length > 0) {
      throw new ApiException(
        403,
        'TENANT_SUSPENDED',
        'This school is temporarily suspended. Contact School All Ways support.',
      );
    }

    const invited = await this.db.runAsActingUser(user.id, (tx) =>
      this.repo.hasInvitedMembership(tx, user.id),
    );

    if (invited) {
      throw new ApiException(
        403,
        'INVITATION_PENDING',
        'You have an invitation waiting — check your SMS or WhatsApp for the join link from your school.',
      );
    }

    throw new ApiException(
      403,
      'NO_SCHOOL_ACCESS',
      'This number is not linked to an active school account. Contact your school for a join link.',
    );
  }

  private async issueAuthResponse(
    user: {
      id: string;
      fullName: string;
      preferredLanguage: string;
      kind: string;
      isMinor: boolean;
    },
    memberships: MembershipRow[],
    device: {
      deviceId?: string;
      deviceName?: string;
      platform?: string;
      appVersion?: string;
      ip?: string;
      userAgent?: string;
    },
  ): Promise<AuthTokensResponseDto> {
    const filesBaseUrl = this.config.getOrThrow<string>('FILES_BASE_URL');
    const reachable = this.staffReachableMemberships(user.kind, memberships);
    const autoScope = reachable.length === 1 ? reachable[0] : null;

    const tokens = await this.tokens.createSession({
      userId: user.id,
      tenantId: autoScope?.tenantId ?? null,
      branchId: autoScope?.branchId ?? null,
      isPlatformAdmin: user.kind === 'platform',
      ...device,
    });

    await this.db.runUnscoped((tx) => this.repo.updateUserLogin(tx, user.id));

    const authUser: AuthUserDto = {
      id: user.id,
      fullName: user.fullName,
      preferredLanguage: user.preferredLanguage,
      kind: user.kind,
      isMinor: user.isMinor,
    };

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      requiresTenantSelection: reachable.length !== 1,
      user: authUser,
      tenants: reachable.map((m) => this.toTenantSummary(m, filesBaseUrl)),
    };
  }

  private toTenantSummary(m: MembershipRow, filesBaseUrl: string): TenantSummaryDto {
    return {
      id: m.tenantId,
      name: m.tenantName,
      slug: m.tenantSlug,
      logoUrl: publicFileUrl(filesBaseUrl, m.tenantLogoPath),
      branchId: m.branchId,
      branchName: m.branchName,
    };
  }

  private async writeTenantMismatchAudit(
    userId: string,
    tenantId: string,
    branchId?: string,
  ): Promise<void> {
    const ctx = RequestContextStore.peek();
    try {
      await this.db.asTenant(tenantId, async (tx) => {
        await tx.insert(auditLogs).values({
          tenantId,
          branchId: branchId ?? null,
          actorUserId: userId,
          action: 'auth.tenant_mismatch',
          entityType: 'tenants',
          entityId: tenantId,
          ip: ctx?.ip ?? null,
          userAgent: ctx?.userAgent ?? null,
          requestId: ctx?.requestId ?? null,
        });
      });
    } catch (err) {
      this.logger.error(
        `Failed to write tenant mismatch audit user=${userId} tenant=${tenantId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

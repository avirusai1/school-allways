import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import type { AccessTokenClaims } from '../../common/rbac/permission.guard';
import { generateOpaqueToken, sha256 } from '../../common/utils/crypto.util';
import { ttlToSeconds } from '../../common/utils/ttl.util';
import { TenantDbService } from '../../common/database/tenant-db.service';
import { AuthRepository } from './auth.repository';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  sessionId: string;
}

@Injectable()
export class TokenService {
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlSeconds: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly db: TenantDbService,
    private readonly repo: AuthRepository,
  ) {
    this.accessTtlSeconds = ttlToSeconds(this.config.get('JWT_ACCESS_TTL') ?? '15m');
    this.refreshTtlSeconds = ttlToSeconds(this.config.get('JWT_REFRESH_TTL') ?? '30d');
  }

  get accessExpiresIn(): number {
    return this.accessTtlSeconds;
  }

  signAccessToken(claims: Omit<AccessTokenClaims, 'iat' | 'exp'>): string {
    return this.jwt.sign(claims, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.accessTtlSeconds,
    });
  }

  async createSession(params: {
    userId: string;
    tenantId: string | null;
    branchId: string | null;
    deviceId?: string;
    deviceName?: string;
    platform?: string;
    appVersion?: string;
    ip?: string;
    userAgent?: string;
    isPlatformAdmin?: boolean;
    impersonatorUserId?: string;
  }): Promise<TokenPair> {
    const refreshToken = generateOpaqueToken();
    const refreshTokenHash = sha256(refreshToken);
    const expiresAt = new Date(Date.now() + this.refreshTtlSeconds * 1000);

    const [session] = await this.db.runUnscoped(async (tx) => {
      return this.repo.insertSession(tx, {
        userId: params.userId,
        refreshTokenHash,
        expiresAt,
        activeTenantId: params.tenantId,
        activeBranchId: params.branchId,
        deviceId: params.deviceId,
        deviceName: params.deviceName,
        platform: params.platform,
        appVersion: params.appVersion,
        ip: params.ip,
        userAgent: params.userAgent,
      });
    });

    const accessToken = this.signAccessToken({
      sub: params.userId,
      tid: params.tenantId,
      bid: params.branchId,
      sid: session.id,
      pa: params.isPlatformAdmin || undefined,
      imp: params.impersonatorUserId,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTtlSeconds,
      sessionId: session.id,
    };
  }

  async rotateRefreshToken(refreshToken: string): Promise<TokenPair> {
    const refreshTokenHash = sha256(refreshToken);

    return this.db.runUnscoped(async (tx) => {
      const session = await this.repo.findSessionByRefreshHash(tx, refreshTokenHash);

      if (!session) {
        throw new Error('UNAUTHENTICATED');
      }

      if (session.revokedAt) {
        await this.repo.revokeAllUserSessions(tx, session.userId, 'refresh_token_reuse');
        throw new Error('TOKEN_REUSE');
      }

      if (session.expiresAt < new Date()) {
        throw new Error('UNAUTHENTICATED');
      }

      const newRefreshToken = generateOpaqueToken();
      const newRefreshHash = sha256(newRefreshToken);
      const expiresAt = new Date(Date.now() + this.refreshTtlSeconds * 1000);

      await this.repo.rotateSessionToken(tx, session.id, newRefreshHash, expiresAt);

      const accessToken = this.signAccessToken({
        sub: session.userId,
        tid: session.activeTenantId,
        bid: session.activeBranchId,
        sid: session.id,
      });

      return {
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn: this.accessTtlSeconds,
        sessionId: session.id,
      };
    });
  }
}

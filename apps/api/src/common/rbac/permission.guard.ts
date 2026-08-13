/**
 * Authentication + tenant context + permission enforcement, in one pass.
 *
 * ORDER MATTERS AND IS DELIBERATE:
 *   1. Public route?          -> let it through, no context.
 *   2. Verify the JWT.        -> establishes userId AND tenantId.
 *   3. Establish tenant ctx.  -> tenantId comes from the TOKEN, never a header.
 *   4. Resolve permissions.   -> cached union across all active roles.
 *   5. Check the requirement. -> deny by default.
 *
 * Step 3 is the one to guard in review. If anyone ever changes it to read a
 * tenant id from a header, query param or body field, tenant isolation is
 * gone — a caller could simply assert a different school's id.
 */

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { eq } from 'drizzle-orm';

import { tenants, users } from '@saw/db';

import {
  ANY_PERMISSIONS_KEY,
  NO_TENANT_KEY,
  PERMISSIONS_KEY,
  PLATFORM_ONLY_KEY,
  PUBLIC_KEY,
} from './permission.decorator';
import { PermissionResolverService } from './permission-resolver.service';
import { RequestContextStore } from '../context/request-context';
import { TenantDbService } from '../database/tenant-db.service';
import { ApiException } from '../errors/api.exception';

export interface AccessTokenClaims {
  sub: string; // userId
  tid: string | null; // tenantId — THE authoritative source
  bid: string | null; // branchId
  sid: string; // sessionId
  pa?: boolean; // platform admin
  imp?: string; // impersonator userId
}

@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly resolver: PermissionResolverService,
    private readonly db: TenantDbService,
  ) {}

  async canActivate(execCtx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      execCtx.getHandler(),
      execCtx.getClass(),
    ]);
    if (isPublic) return true;

    const req = execCtx.switchToHttp().getRequest<Request>();
    const ctx = RequestContextStore.get();

    // --- 2. Verify the token ------------------------------------------------
    const token = this.extractToken(req);
    if (!token) throw new UnauthorizedException('Missing access token');

    let claims: AccessTokenClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessTokenClaims>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    // --- 3. Establish context. FROM THE TOKEN ONLY. -------------------------
    ctx.userId = claims.sub;
    ctx.sessionId = claims.sid;
    ctx.tenantId = claims.tid;
    ctx.branchId = claims.bid;
    ctx.isPlatformAdmin = claims.pa === true;
    ctx.impersonatorUserId = claims.imp ?? null;

    const platformOnly = this.reflector.getAllAndOverride<boolean>(PLATFORM_ONLY_KEY, [
      execCtx.getHandler(),
      execCtx.getClass(),
    ]);
    if (platformOnly) {
      if (!ctx.isPlatformAdmin) {
        throw new ForbiddenException('Platform console access required');
      }
      // Console routes never need a selected school — aggregate tables only.
      return true;
    }

    const noTenantRequired = this.reflector.getAllAndOverride<boolean>(NO_TENANT_KEY, [
      execCtx.getHandler(),
      execCtx.getClass(),
    ]);

    if (!ctx.tenantId && !noTenantRequired && !ctx.isPlatformAdmin) {
      throw new UnauthorizedException(
        'No school selected. Choose a school before calling this endpoint.',
      );
    }

    if (ctx.tenantId && ctx.userId && !ctx.isPlatformAdmin && !noTenantRequired) {
      await this.assertStaffTenantActive(ctx.tenantId, ctx.userId);
    }

    const required =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        execCtx.getHandler(),
        execCtx.getClass(),
      ]) ?? [];

    const anyRequired =
      this.reflector.getAllAndOverride<string[]>(ANY_PERMISSIONS_KEY, [
        execCtx.getHandler(),
        execCtx.getClass(),
      ]) ?? [];

    // Authenticated but permission-free routes (profile, school switcher).
    if (required.length === 0 && anyRequired.length === 0) return true;

    // --- 4. Resolve -------------------------------------------------------
    if (!ctx.tenantId) {
      throw new ForbiddenException('Permissions require a selected school');
    }

    const access = await this.resolver.resolve(ctx.tenantId, ctx.userId, ctx.branchId);
    ctx.roleCodes = access.roleCodes;
    ctx.permissions = access.permissions;

    // --- 5. Enforce. Deny by default. --------------------------------------
    if (anyRequired.length > 0) {
      const hasAny = anyRequired.some((code) => ctx.permissions.has(code));
      if (!hasAny) {
        this.logger.warn(
          `DENIED user=${ctx.userId} tenant=${ctx.tenantId} roles=[${access.roleCodes.join(',')}] ` +
            `needs_any=[${anyRequired.join(',')}] path=${req.method} ${req.path}`,
        );
        throw new ForbiddenException(
          `You do not have permission to do this (need one of: ${anyRequired.join(', ')})`,
        );
      }
      return true;
    }

    const missing = required.filter((code) => !ctx.permissions.has(code));
    if (missing.length > 0) {
      this.logger.warn(
        `DENIED user=${ctx.userId} tenant=${ctx.tenantId} roles=[${access.roleCodes.join(',')}] ` +
          `missing=[${missing.join(',')}] path=${req.method} ${req.path}`,
      );
      throw new ForbiddenException(
        `You do not have permission to do this (${missing.join(', ')})`,
      );
    }

    return true;
  }

  private extractToken(req: Request): string | null {
    const header = req.headers.authorization;
    if (!header) return null;
    const [scheme, value] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && value ? value : null;
  }

  /**
   * Staff/admin sessions die when the school is suspended. Parents who already
   * paid for the session keep access — cutting them off would punish the wrong people.
   */
  private async assertStaffTenantActive(tenantId: string, userId: string): Promise<void> {
    const row = await this.db.run(async (tx) => {
      const [user] = await tx
        .select({ kind: users.kind })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const [tenant] = await tx
        .select({ status: tenants.status })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      return { kind: user?.kind, status: tenant?.status };
    });
    if (!row.kind || row.kind === 'guardian' || row.kind === 'student' || row.kind === 'platform') {
      return;
    }
    if (row.status === 'suspended') {
      throw new ApiException(
        403,
        'TENANT_SUSPENDED',
        'This school is temporarily suspended. Contact School All Ways support.',
      );
    }
  }
}

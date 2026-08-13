/**
 * Feature flag resolution — kill switch → override → plan → rollout % → default.
 * Resolved set cached in Redis for 5 minutes; busted on any flag write.
 */

import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type Redis from 'ioredis';

import {
  plans,
  platformFeatureFlags,
  subscriptions,
  tenantFeatureOverrides,
} from '@saw/db';

import { RequestContextStore } from '../../common/context/request-context';
import { TenantDbService } from '../../common/database/tenant-db.service';
import { ApiException } from '../../common/errors/api.exception';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import type { CreateFlagDto, FlagKillDto, FlagOverrideDto } from './dto/platform.dto';

const CACHE_TTL_SEC = 5 * 60;
const cacheKey = (tenantId: string) => `flags:resolved:${tenantId}`;

@Injectable()
export class FeatureFlagsService {
  constructor(
    private readonly db: TenantDbService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async listFlags() {
    return this.db.run(async (tx) =>
      tx
        .select({
          id: platformFeatureFlags.id,
          key: platformFeatureFlags.key,
          name: platformFeatureFlags.name,
          description: platformFeatureFlags.description,
          moduleCode: platformFeatureFlags.moduleCode,
          kind: platformFeatureFlags.kind,
          defaultValue: platformFeatureFlags.defaultValue,
          rolloutPercentage: platformFeatureFlags.rolloutPercentage,
          isKillSwitched: platformFeatureFlags.isKillSwitched,
          isActive: platformFeatureFlags.isActive,
        })
        .from(platformFeatureFlags)
        .where(eq(platformFeatureFlags.isActive, true))
        .orderBy(sql`${platformFeatureFlags.key} asc`),
    );
  }

  async createFlag(dto: CreateFlagDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [row] = await tx
        .insert(platformFeatureFlags)
        .values({
          key: dto.key,
          name: dto.name,
          description: dto.description,
          moduleCode: dto.moduleCode,
          kind: dto.kind ?? 'boolean',
          defaultValue: dto.defaultValue ?? false,
          rolloutPercentage: dto.rolloutPercentage ?? 0,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({
          id: platformFeatureFlags.id,
          key: platformFeatureFlags.key,
        });
      await this.bustAllCaches();
      return row;
    });
  }

  async setOverride(flagId: string, dto: FlagOverrideDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [flag] = await tx
        .select({ id: platformFeatureFlags.id })
        .from(platformFeatureFlags)
        .where(eq(platformFeatureFlags.id, flagId))
        .limit(1);
      if (!flag) throw new ApiException(404, 'NOT_FOUND', 'Flag not found');

      const [row] = await tx
        .insert(tenantFeatureOverrides)
        .values({
          tenantId: dto.tenantId,
          flagId,
          value: dto.value,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          reason: dto.reason,
          setByUserId: ctx.userId,
        })
        .onConflictDoUpdate({
          target: [tenantFeatureOverrides.tenantId, tenantFeatureOverrides.flagId],
          set: {
            value: dto.value,
            expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
            reason: dto.reason,
            setByUserId: ctx.userId,
            updatedAt: new Date(),
          },
        })
        .returning({
          id: tenantFeatureOverrides.id,
          tenantId: tenantFeatureOverrides.tenantId,
          expiresAt: tenantFeatureOverrides.expiresAt,
        });

      await this.bustTenantCache(dto.tenantId);
      return row;
    });
  }

  async setKillSwitch(flagId: string, dto: FlagKillDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [row] = await tx
        .update(platformFeatureFlags)
        .set({
          isKillSwitched: dto.enabled,
          updatedAt: new Date(),
          updatedBy: ctx.userId,
        })
        .where(eq(platformFeatureFlags.id, flagId))
        .returning({
          id: platformFeatureFlags.id,
          key: platformFeatureFlags.key,
          isKillSwitched: platformFeatureFlags.isKillSwitched,
        });
      if (!row) throw new ApiException(404, 'NOT_FOUND', 'Flag not found');
      await this.bustAllCaches();
      return row;
    });
  }

  /**
   * Resolve every active flag for a tenant. Cached 5 min in Redis.
   */
  async resolveForTenant(tenantId: string): Promise<Record<string, unknown>> {
    const cached = await this.redis.get(cacheKey(tenantId));
    if (cached) {
      try {
        return JSON.parse(cached) as Record<string, unknown>;
      } catch {
        /* recompute */
      }
    }

    const resolved = await this.computeResolved(tenantId);
    await this.redis.set(cacheKey(tenantId), JSON.stringify(resolved), 'EX', CACHE_TTL_SEC);
    return resolved;
  }

  async isEnabled(tenantId: string, key: string): Promise<boolean> {
    const all = await this.resolveForTenant(tenantId);
    return Boolean(all[key]);
  }

  private async computeResolved(tenantId: string): Promise<Record<string, unknown>> {
    return this.db.run(async (tx) => {
      const flags = await tx
        .select({
          id: platformFeatureFlags.id,
          key: platformFeatureFlags.key,
          moduleCode: platformFeatureFlags.moduleCode,
          defaultValue: platformFeatureFlags.defaultValue,
          rolloutPercentage: platformFeatureFlags.rolloutPercentage,
          isKillSwitched: platformFeatureFlags.isKillSwitched,
        })
        .from(platformFeatureFlags)
        .where(eq(platformFeatureFlags.isActive, true));

      const overrides = await tx
        .select({
          flagId: tenantFeatureOverrides.flagId,
          value: tenantFeatureOverrides.value,
          expiresAt: tenantFeatureOverrides.expiresAt,
        })
        .from(tenantFeatureOverrides)
        .where(
          and(
            eq(tenantFeatureOverrides.tenantId, tenantId),
            or(
              isNull(tenantFeatureOverrides.expiresAt),
              gt(tenantFeatureOverrides.expiresAt, new Date()),
            ),
          ),
        );
      const overrideByFlag = new Map(overrides.map((o) => [o.flagId, o.value]));

      const planModules = await this.planModulesForTenant(tx, tenantId);

      const out: Record<string, unknown> = {};
      for (const flag of flags) {
        // 1. Kill switch — off everywhere, stop.
        if (flag.isKillSwitched) {
          out[flag.key] = false;
          continue;
        }
        // 2. Unexpired tenant override.
        if (overrideByFlag.has(flag.id)) {
          out[flag.key] = overrideByFlag.get(flag.id);
          continue;
        }
        // 3. Plan includes the module this flag gates.
        if (flag.moduleCode && planModules.has(flag.moduleCode)) {
          out[flag.key] = true;
          continue;
        }
        // 4. Rollout % covers this tenant (stable hash bucket).
        const pct = flag.rolloutPercentage ?? 0;
        if (pct > 0 && this.bucket(tenantId, flag.key) < pct) {
          out[flag.key] = true;
          continue;
        }
        // 5. Flag default.
        out[flag.key] = flag.defaultValue;
      }
      return out;
    });
  }

  private async planModulesForTenant(
    tx: Parameters<Parameters<TenantDbService['run']>[0]>[0],
    tenantId: string,
  ): Promise<Set<string>> {
    const [sub] = await tx
      .select({ includedModules: plans.includedModules })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .where(
        and(
          eq(subscriptions.tenantId, tenantId),
          sql`${subscriptions.status} in ('trial','active','past_due')`,
        ),
      )
      .orderBy(sql`${subscriptions.startsAt} desc`)
      .limit(1);
    return new Set(sub?.includedModules ?? []);
  }

  /** Stable 0–99 bucket so a school never flips between requests. */
  bucket(tenantId: string, flagKey: string): number {
    const hex = createHash('sha256').update(`${tenantId}:${flagKey}`).digest('hex');
    return parseInt(hex.slice(0, 8), 16) % 100;
  }

  private async bustTenantCache(tenantId: string): Promise<void> {
    await this.redis.del(cacheKey(tenantId));
  }

  private async bustAllCaches(): Promise<void> {
    const keys = await this.redis.keys('flags:resolved:*');
    if (keys.length > 0) await this.redis.del(...keys);
  }
}

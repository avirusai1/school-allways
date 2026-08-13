import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import type Redis from 'ioredis';

import { Public } from '../../common/rbac/permission.decorator';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import { TenantDbService } from '../../common/database/tenant-db.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly db: TenantDbService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Public()
  @Get()
  async check(): Promise<{ status: string; db: boolean; redis: boolean; uptime: number }> {
    const [db, redis] = await Promise.all([
      this.db.ping().catch(() => false),
      this.redis
        .ping()
        .then((r) => r === 'PONG')
        .catch(() => false),
    ]);

    if (!db) {
      // Redis being down degrades performance; Postgres being down is fatal.
      throw new ServiceUnavailableException({ status: 'unhealthy', db, redis });
    }

    return { status: 'ok', db, redis, uptime: Math.floor(process.uptime()) };
  }
}

import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import { RequirePermission } from '../../common/rbac/permission.decorator';
import { SyncAckDto, SyncPullQuery, SyncStatusQuery } from './dto/sync.dto';
import { SyncService } from './sync.service';

/**
 * Sync routes are authenticated but permission-light: any tenant member may
 * sync entities they can already read. Entity scope is enforced in the service.
 */
@Controller('sync')
export class SyncController {
  constructor(private readonly service: SyncService) {}

  /** Cold-start only — badge counts, no payloads. Budget < 500 bytes. */
  @Get('status')
  @RequirePermission()
  status(@Query() query: SyncStatusQuery) {
    return this.service.status({
      cursor: query.cursor,
      deviceId: query.deviceId,
      entities: query.entities,
    });
  }

  @Get('pull')
  @RequirePermission()
  pull(@Query() query: SyncPullQuery) {
    return this.service.pull({
      cursor: query.cursor,
      entities: query.entities,
      limit: query.limit,
      deviceId: query.deviceId,
    });
  }

  @Post('ack')
  @RequirePermission()
  ack(@Body() dto: SyncAckDto) {
    return this.service.ack(dto);
  }
}

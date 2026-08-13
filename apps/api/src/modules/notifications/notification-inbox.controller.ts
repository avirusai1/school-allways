import { Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

import type { GrantedPermission } from '../../common/context/request-context';
import { Grant, RequirePermission } from '../../common/rbac/permission.decorator';
import { SubscriptionAccessService } from '../../common/rbac/subscription-access.service';
import { ABSENTEE_TEMPLATE_CODE } from '../subscriptions/billing.constants';
import { NotificationInboxService } from './notification-inbox.service';

class InboxQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

@Controller('notifications')
export class NotificationInboxController {
  constructor(
    private readonly inbox: NotificationInboxService,
    private readonly subscriptions: SubscriptionAccessService,
  ) {}

  @Get('inbox')
  @RequirePermission('notification.inbox.read')
  async list(
    @Query() query: InboxQuery,
    @Grant('notification.inbox.read') grant: GrantedPermission,
  ) {
    const result = await this.inbox.list(query.limit ?? 50);
    if (grant.scope !== 'self') return result;
    const childIds = grant.studentIds ?? [];
    const anyPaid = await this.subscriptions.tenantHasAnySubscribedChild(childIds);
    if (anyPaid) return result;
    const data = result.data.filter((item) => item.templateCode === ABSENTEE_TEMPLATE_CODE);
    return { data, meta: { unread: data.filter((d) => !d.readAt).length } };
  }

  @Patch('inbox/:id/read')
  @RequirePermission('notification.inbox.read')
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @Grant('notification.inbox.read') _grant: GrantedPermission,
  ) {
    return this.inbox.markRead(id);
  }
}

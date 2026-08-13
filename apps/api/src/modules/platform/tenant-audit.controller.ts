import { Controller, Get } from '@nestjs/common';

import { RequestContextStore } from '../../common/context/request-context';
import { RequirePermission } from '../../common/rbac/permission.decorator';
import { PlatformService } from './platform.service';

/**
 * School-visible support session history — lives outside /platform so a
 * principal can see every time our team entered their tenant.
 */
@Controller('tenant')
export class TenantAuditController {
  constructor(private readonly platform: PlatformService) {}

  @Get('support-sessions')
  @RequirePermission('tenant.settings.read')
  list() {
    const ctx = RequestContextStore.get();
    return this.platform.schoolVisibleSupportSessions(ctx.tenantId!);
  }
}

import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { PermissionResolverService } from './permission-resolver.service';
import { PermissionGuard } from './permission.guard';
import { SubscriptionAccessService } from './subscription-access.service';

@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [PermissionResolverService, PermissionGuard, SubscriptionAccessService],
  exports: [PermissionResolverService, PermissionGuard, SubscriptionAccessService, JwtModule],
})
export class RbacModule {}

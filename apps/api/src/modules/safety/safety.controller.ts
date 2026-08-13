import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';

import {
  RequestContextStore,
  type GrantedPermission,
} from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { Grant, RequirePermission } from '../../common/rbac/permission.decorator';
import {
  AuthorisedPickupQuery,
  CreateAuthorisedPickupDto,
  CreateGatePassDto,
  CreateVisitorDto,
  ListVisitorsQuery,
  PickupHandoverDto,
  PickupOtpDto,
  PickupVerifyDto,
  PreRegisterVisitorDto,
} from './dto/safety.dto';
import { SafetyService } from './safety.service';

@Controller()
export class SafetyController {
  constructor(private readonly service: SafetyService) {}

  // --- Gate / visitors ---

  @Get('gate/visitors')
  @RequirePermission('gate.visitor.read')
  listVisitors(@Query() query: ListVisitorsQuery) {
    return this.service.listVisitors(query.day);
  }

  @Post('gate/visitors')
  @RequirePermission('gate.visitor.manage')
  createVisitor(@Body() dto: CreateVisitorDto) {
    return this.service.createVisitor(dto);
  }

  @Post('gate/visitors/pre-register')
  @RequirePermission('gate.visitor.manage')
  preRegister(@Body() dto: PreRegisterVisitorDto) {
    return this.service.preRegister(dto);
  }

  @Post('gate/visitors/:id/checkout')
  @HttpCode(200)
  @RequirePermission('gate.visitor.manage')
  checkout(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.checkoutVisitor(id);
  }

  @Get('gate/inside')
  @RequirePermission('gate.visitor.read')
  inside() {
    return this.service.insideNow();
  }

  @Post('gate/passes')
  @RequirePermission('gate.pass.manage')
  createPass(@Body() dto: CreateGatePassDto) {
    return this.service.createGatePass(dto);
  }

  // --- Authorised pickup / handover ---

  @Get('pickup/authorised')
  @RequirePermission('pickup.authorisation.read')
  listAuthorised(
    @Query() query: AuthorisedPickupQuery,
    @Grant('pickup.authorisation.read') grant: GrantedPermission,
  ) {
    return this.service.listAuthorised(query.studentId, grant);
  }

  @Post('pickup/authorised')
  @RequirePermission('pickup.authorisation.manage')
  addAuthorised(
    @Body() dto: CreateAuthorisedPickupDto,
    @Grant('pickup.authorisation.manage') grant: GrantedPermission,
  ) {
    return this.service.addAuthorised(dto, grant);
  }

  @Delete('pickup/authorised/:id')
  @RequirePermission('pickup.authorisation.manage')
  revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @Grant('pickup.authorisation.manage') grant: GrantedPermission,
  ) {
    return this.service.revokeAuthorised(id, grant);
  }

  @Post('pickup/otp')
  @RequirePermission('pickup.authorisation.manage')
  otp(
    @Body() dto: PickupOtpDto,
    @Grant('pickup.authorisation.manage') grant: GrantedPermission,
  ) {
    return this.service.generatePickupOtp(dto, grant);
  }

  @Post('pickup/verify')
  @HttpCode(200)
  @RequirePermission('pickup.handover.record')
  verify(@Body() dto: PickupVerifyDto) {
    return this.service.verifyPickup(dto);
  }

  @Post('pickup/handover')
  @HttpCode(200)
  @RequirePermission('pickup.handover.record')
  handover(@Body() dto: PickupHandoverDto) {
    if (dto.verificationMethod === 'manual_override') {
      const override = RequestContextStore.get().permissions.get(
        'pickup.handover.override',
      );
      if (!override) {
        throw new ApiException(
          403,
          'OVERRIDE_FORBIDDEN',
          'Manual pickup override requires the override permission. The principal will be alerted when it is used.',
        );
      }
    }
    return this.service.handover(dto);
  }
}

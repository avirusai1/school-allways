import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';

import {
  NoTenantRequired,
  PlatformOnly,
  Public,
} from '../../common/rbac/permission.decorator';
import { AuthService } from './auth.service';
import { JoinService } from './join.service';
import { PasswordLoginDto } from './dto/password-login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { SelectTenantDto } from './dto/select-tenant.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import {
  RegisterDeviceTokenDto,
  UnregisterDeviceTokenDto,
} from './dto/device-token.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly join_: JoinService,
  ) {}

  @Public()
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.auth.requestOtp(dto);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto);
  }

  /**
   * The token in the URL is the credential — there is no session yet, which is
   * the whole point of an invitation link. All four outcomes come back 200 with
   * a `status`; see JoinResponseDto for why.
   */
  @Public()
  @Post('join/:token')
  @HttpCode(HttpStatus.OK)
  join(@Param('token') token: string) {
    return this.join_.join(token);
  }

  /**
   * Redeems the one-time code the public signup form redirected with, so a
   * live session never has to travel in a URL between our two origins.
   */
  @Public()
  @Post('handoff/:code')
  @HttpCode(HttpStatus.OK)
  handoff(@Param('code') code: string) {
    return this.join_.handoff(code);
  }

  @Public()
  @Post('password/login')
  @HttpCode(HttpStatus.OK)
  passwordLogin(@Body() dto: PasswordLoginDto) {
    return this.auth.passwordLogin(dto);
  }

  @NoTenantRequired()
  @Post('select-tenant')
  @HttpCode(HttpStatus.OK)
  selectTenant(@Body() dto: SelectTenantDto) {
    return this.auth.selectTenant(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Get('session')
  getSession() {
    return this.auth.getSession();
  }

  /**
   * The console's equivalent of `session`. Separate route rather than a branch
   * inside `session`, because the two return different shapes and a client
   * should not have to discover which one it got.
   */
  @PlatformOnly()
  @Get('platform-session')
  getPlatformSession() {
    return this.auth.getPlatformSession();
  }

  @NoTenantRequired()
  @Get('me')
  me() {
    return this.auth.me();
  }

  @NoTenantRequired()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(): Promise<void> {
    await this.auth.logout();
  }

  @NoTenantRequired()
  @Post('device-token')
  @HttpCode(HttpStatus.OK)
  registerDeviceToken(@Body() dto: RegisterDeviceTokenDto) {
    return this.auth.registerDeviceToken(dto);
  }

  @NoTenantRequired()
  @Delete('device-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unregisterDeviceToken(@Body() dto: UnregisterDeviceTokenDto): Promise<void> {
    await this.auth.unregisterDeviceToken(dto.fcmToken);
  }
}

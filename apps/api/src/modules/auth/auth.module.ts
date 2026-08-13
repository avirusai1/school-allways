import { Module, forwardRef } from '@nestjs/common';

import { PlatformModule } from '../platform/platform.module';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { JoinService } from './join.service';
import { OtpService } from './otp.service';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

@Module({
  imports: [forwardRef(() => PlatformModule)],
  controllers: [AuthController],
  providers: [
    AuthRepository,
    AuthService,
    JoinService,
    OtpService,
    TokenService,
    SessionService,
  ],
  exports: [AuthService, TokenService, OtpService],
})
export class AuthModule {}

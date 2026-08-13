import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { unlink } from 'node:fs/promises';
import type { Request } from 'express';

import { ApiException } from '../../common/errors/api.exception';
import { Public } from '../../common/rbac/permission.decorator';
import { RequirePermission } from '../../common/rbac/permission.decorator';
import {
  CallbackRequestDto,
  CompleteStepDto,
  InviteParentsDto,
  InviteStaffDto,
  PublicSignupDto,
  VerifySignupDto,
} from './dto/onboarding.dto';
import { OnboardingService } from './onboarding.service';
import { SignupService } from './signup.service';

@Controller()
export class OnboardingController {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly signup: SignupService,
  ) {}

  @Public()
  @Post('public/signup')
  startSignup(@Body() dto: PublicSignupDto, @Req() req: Request) {
    const ip =
      (typeof req.headers['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for'].split(',')[0]?.trim()
        : undefined) ?? req.ip;
    return this.signup.startSignup(dto, ip);
  }

  @Public()
  @Post('public/signup/:id/verify')
  verifySignup(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifySignupDto,
  ) {
    return this.signup.verifySignup(id, dto.code);
  }

  @Get('onboarding/state')
  @RequirePermission('tenant.onboarding.manage')
  state() {
    return this.onboarding.getState();
  }

  @Post('onboarding/steps/:step')
  @RequirePermission('tenant.onboarding.manage')
  completeStep(@Param('step') step: string, @Body() dto: CompleteStepDto) {
    return this.onboarding.completeStep(step, dto);
  }

  @Post('onboarding/logo')
  @RequirePermission('tenant.onboarding.manage')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: tmpdir(),
        filename: (_req, file, cb) => cb(null, `${randomUUID()}-${file.originalname}`),
      }),
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  async uploadLogo(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file?.path) {
      throw new ApiException(400, 'NO_FILE', 'A logo image file is required.');
    }
    try {
      return await this.onboarding.uploadLogo(file);
    } finally {
      await unlink(file.path).catch(() => undefined);
    }
  }

  @Post('onboarding/sample-data/wipe')
  @RequirePermission('tenant.onboarding.manage')
  wipeSample() {
    return this.onboarding.wipeSampleData();
  }

  @Get('onboarding/invite/status')
  @RequirePermission('tenant.onboarding.manage')
  inviteStatus() {
    return this.onboarding.inviteStatus();
  }

  @Post('onboarding/invite/staff')
  @RequirePermission('tenant.onboarding.manage')
  inviteStaff(@Body() dto: InviteStaffDto) {
    return this.onboarding.inviteStaff(dto);
  }

  @Post('onboarding/invite/parents')
  @RequirePermission('tenant.onboarding.manage')
  inviteParents(@Body() dto: InviteParentsDto) {
    return this.onboarding.inviteParents(dto);
  }

  @Post('onboarding/callback-request')
  @RequirePermission('tenant.onboarding.manage')
  callback(@Body() dto: CallbackRequestDto) {
    return this.onboarding.requestCallback(dto);
  }
}

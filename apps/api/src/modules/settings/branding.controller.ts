import {
  Body,
  Controller,
  Delete,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import { ApiException } from '../../common/errors/api.exception';
import { RequirePermission } from '../../common/rbac/permission.decorator';
import { BrandingService } from './branding.service';
import { UpdateBrandingDto } from './dto/branding.dto';

/**
 * White-label branding: a school's logo and accent color, changeable any time
 * from the admin app's Settings screen — not just once during onboarding.
 */
@Controller('tenant/branding')
export class BrandingController {
  constructor(private readonly branding: BrandingService) {}

  @Post('logo')
  @RequirePermission('tenant.settings.manage')
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
      return await this.branding.uploadLogo(file);
    } finally {
      await unlink(file.path).catch(() => undefined);
    }
  }

  @Delete('logo')
  @RequirePermission('tenant.settings.manage')
  removeLogo() {
    return this.branding.removeLogo();
  }

  @Post('color')
  @RequirePermission('tenant.settings.manage')
  updateColor(@Body() dto: UpdateBrandingDto) {
    return this.branding.updateColor(dto.primaryColor);
  }
}

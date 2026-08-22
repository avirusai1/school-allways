import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';

import { tenants } from '@saw/db';

import { RequestContextStore } from '../../common/context/request-context';
import { TenantDbService } from '../../common/database/tenant-db.service';
import { ApiException } from '../../common/errors/api.exception';
import { StorageService } from '../../common/storage/storage.service';
import { publicFileUrl } from '../../common/utils/url.util';

/**
 * White-label branding, settable ANY TIME by a school admin — not just during
 * onboarding. `OnboardingService.uploadLogo()` covers the wizard's one-shot
 * logo step; this is the standing "Settings" equivalent, gated on
 * `tenant.settings.manage` rather than `tenant.onboarding.manage`, so it stays
 * reachable long after a school finishes onboarding.
 *
 * The `tenants` table has carried `logoPath` and `primaryColor` since the
 * first migration — this was a schema with no way to write to it after day
 * one, and on the web side `primaryColor` was never even read back into the
 * page. Flutter already applies it correctly via `AppTheme.build(primary)`.
 */
@Injectable()
export class BrandingService {
  constructor(
    private readonly db: TenantDbService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  async uploadLogo(file: Express.Multer.File) {
    const ctx = RequestContextStore.get();
    if (!file?.buffer?.length && !file?.path) {
      throw new ApiException(400, 'VALIDATION_ERROR', 'Choose a logo image to upload.');
    }
    const ext = (file.originalname.split('.').pop() ?? 'png')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    // Same key every time, deliberately: re-uploading REPLACES the logo
    // rather than accumulating orphaned files per upload.
    const key = `t/${ctx.tenantId}/branding/logo.${ext || 'png'}`;
    const { promises: fs } = await import('node:fs');
    const data = file.buffer?.length ? file.buffer : await fs.readFile(file.path);
    await this.storage.writeBuffer(key, data);

    await this.db.run(async (tx) => {
      await tx.update(tenants).set({ logoPath: key }).where(eq(tenants.id, ctx.tenantId!));
    });

    RequestContextStore.addAudit({
      action: 'tenant.branding.logo_updated',
      entityType: 'tenants',
      entityId: ctx.tenantId!,
    });

    const filesBase = this.config.getOrThrow<string>('FILES_BASE_URL');
    return { logoPath: key, logoUrl: publicFileUrl(filesBase, key) };
  }

  async removeLogo() {
    const ctx = RequestContextStore.get();
    await this.db.run(async (tx) => {
      await tx.update(tenants).set({ logoPath: null }).where(eq(tenants.id, ctx.tenantId!));
    });
    RequestContextStore.addAudit({
      action: 'tenant.branding.logo_removed',
      entityType: 'tenants',
      entityId: ctx.tenantId!,
    });
    return { logoPath: null, logoUrl: null };
  }

  async updateColor(primaryColor: string | null | undefined) {
    const ctx = RequestContextStore.get();
    await this.db.run(async (tx) => {
      await tx
        .update(tenants)
        .set({ primaryColor: primaryColor ?? null })
        .where(eq(tenants.id, ctx.tenantId!));
    });
    RequestContextStore.addAudit({
      action: 'tenant.branding.color_updated',
      entityType: 'tenants',
      entityId: ctx.tenantId!,
    });
    return { primaryColor: primaryColor ?? null };
  }
}

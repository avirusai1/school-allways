import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { diskStorage } from 'multer';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { IsArray, IsUUID, ArrayMaxSize } from 'class-validator';

import type { GrantedPermission } from '../../common/context/request-context';
import { Grant, RequireAnyPermission, RequirePermission } from '../../common/rbac/permission.decorator';
import { BulkIssueAccountsDto } from '../../common/dto/bulk-issue.dto';
import { ApiException } from '../../common/errors/api.exception';
import { toCsv } from '../../common/util/csv.util';
import { OnboardingService } from '../onboarding/onboarding.service';
import { IssueGuardianAccountDto } from './dto/issue-guardian-account.dto';
import { ListPendingGuardiansQuery } from './dto/list-pending-guardians.query';
import { StudentsService } from './students.service';

class InviteGuardiansDto {
  @IsArray() @IsUUID('4', { each: true }) @ArrayMaxSize(500)
  guardianIds!: string[];
}

@Controller('guardians')
export class GuardiansController {
  constructor(
    private readonly service: StudentsService,
    private readonly onboarding: OnboardingService,
  ) {}

  @Get('pending-accounts')
  @RequirePermission('guardian.account.issue')
  listPending(
    @Query() query: ListPendingGuardiansQuery,
    @Grant('guardian.account.issue') grant: GrantedPermission,
  ) {
    return this.service.listPendingGuardianAccounts(query, grant);
  }

  @Post('account/bulk-issue')
  @RequireAnyPermission('guardian.account.issue', 'guardian.account.issue.bulk')
  async bulkIssue(
    @Body() dto: BulkIssueAccountsDto,
    @Query('format') format: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.bulkIssueGuardianAccounts(dto);
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="guardian-credentials.csv"',
      );
      return toCsv(
        ['Name', 'Phone', 'Class', 'Temporary password'],
        result.issued.map((a) => [
          a.fullName,
          a.phone,
          a.sectionLabel ?? '',
          a.temporaryPassword,
        ]),
      );
    }
    return result;
  }

  @Post('emails/bulk-update')
  @RequirePermission('student.guardian.manage')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: tmpdir(),
        filename: (_req, file, cb) => cb(null, `${randomUUID()}-${file.originalname}`),
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async bulkUpdateEmails(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file?.path) {
      throw new ApiException(400, 'NO_FILE', 'A CSV or Excel file is required.');
    }
    try {
      return await this.service.bulkUpdateGuardianEmails(file.path);
    } finally {
      await unlink(file.path).catch(() => undefined);
    }
  }

  @Post('invite')
  @RequirePermission('guardian.account.issue')
  inviteParents(@Body() dto: InviteGuardiansDto) {
    return this.onboarding.inviteParents({ guardianIds: dto.guardianIds });
  }

  @Post(':id/account')
  @RequirePermission('guardian.account.issue')
  issueAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IssueGuardianAccountDto,
  ) {
    return this.service.issueGuardianAccount(id, dto);
  }
}

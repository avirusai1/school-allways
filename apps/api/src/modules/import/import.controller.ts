import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { diskStorage } from 'multer';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import { RequirePermission } from '../../common/rbac/permission.decorator';
import { ApiException } from '../../common/errors/api.exception';
import {
  CommitImportDto,
  ListImportQuery,
  MapImportDto,
  TemplateQuery,
  UploadImportDto,
} from './dto/import.dto';
import { ImportService } from './import.service';

@Controller('import')
export class ImportController {
  constructor(private readonly service: ImportService) {}

  @Get('template')
  @RequirePermission('student.import.run')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async template(@Query() query: TemplateQuery, @Res() res: Response) {
    const buf = await this.service.getTemplate(query.entity);
    const name = query.entity === 'staff' ? 'staff-import-template.xlsx' : 'student-import-template.xlsx';
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(buf);
  }

  @Get()
  @RequirePermission('student.import.run')
  list(@Query() query: ListImportQuery) {
    return this.service.listBatches(query.branchId);
  }

  @Post('upload')
  @RequirePermission('student.import.run')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: tmpdir(),
        filename: (_req, file, cb) => cb(null, `${randomUUID()}-${file.originalname}`),
      }),
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: UploadImportDto,
  ) {
    if (!file?.path) {
      throw new ApiException(400, 'NO_FILE', 'A spreadsheet file is required.');
    }

    const stream = createReadStream(file.path);
    try {
      return await this.service.upload({
        branchId: body.branchId,
        entity: body.entity,
        vendor: body.vendor,
        filename: file.originalname,
        fileStream: stream,
      });
    } finally {
      await unlink(file.path).catch(() => undefined);
    }
  }

  @Post(':id/map')
  @RequirePermission('student.import.run')
  map(@Param('id', ParseUUIDPipe) id: string, @Body() body: MapImportDto) {
    return this.service.map(id, body.mapping, body.vendor);
  }

  @Post(':id/validate')
  @RequirePermission('student.import.run')
  validate(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.validate(id);
  }

  @Post(':id/commit')
  @RequirePermission('student.import.run')
  @HttpCode(HttpStatus.ACCEPTED)
  commit(@Param('id', ParseUUIDPipe) id: string, @Body() body: CommitImportDto) {
    return this.service.commit(id, body.partialCommit ?? true);
  }

  @Get(':id/status')
  @RequirePermission('student.import.run')
  status(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getStatus(id);
  }

  @Get(':id/errors.xlsx')
  @RequirePermission('student.import.run')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async errorsXlsx(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const buf = await this.service.getErrorsXlsx(id);
    res.setHeader('Content-Disposition', `attachment; filename="import-errors-${id}.xlsx"`);
    res.send(buf);
  }

  @Post(':id/undo')
  @RequirePermission('student.import.run')
  undo(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.undo(id);
  }
}

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import type { GrantedPermission } from '../../common/context/request-context';
import { Grant, RequirePermission } from '../../common/rbac/permission.decorator';
import { BooksService } from './books.service';
import {
  AddBookFileDto,
  BookSyncStatusQuery,
  CreateBookDto,
  CreateLibraryItemDto,
  IssueLoanDto,
  ListBooksQuery,
  ListLibraryQuery,
  RecordDownloadedDto,
  ReturnLoanDto,
} from './dto/books.dto';

@Controller()
export class BooksController {
  constructor(private readonly service: BooksService) {}

  // --- Digital books ---

  @Get('books')
  @RequirePermission('book.read')
  list(
    @Query() query: ListBooksQuery,
    @Grant('book.read') grant: GrantedPermission,
  ) {
    return this.service.listBooks(grant, {
      classId: query.classId,
      sectionId: query.sectionId,
      subjectId: query.subjectId,
      studentId: query.studentId,
      academicSessionId: query.academicSessionId,
    });
  }

  @Post('books')
  @RequirePermission('book.manage')
  create(@Body() dto: CreateBookDto) {
    return this.service.createBook(dto);
  }

  /** 302 → signed URL on the files host. Caddy serves the bytes, not Nest. */
  @Get('books/files/:id/download')
  @RequirePermission('book.read')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Grant('book.read') grant: GrantedPermission,
    @Res() res: Response,
  ) {
    const { url } = await this.service.downloadRedirect(id, grant);
    return res.redirect(302, url);
  }

  @Post('books/files/:id/downloaded')
  @RequirePermission('book.read')
  downloaded(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordDownloadedDto,
    @Grant('book.read') grant: GrantedPermission,
  ) {
    return this.service.recordDownloaded(id, dto, grant);
  }

  @Get('books/sync-status')
  @RequirePermission('book.read')
  syncStatus(
    @Query() query: BookSyncStatusQuery,
    @Grant('book.read') grant: GrantedPermission,
  ) {
    return this.service.syncStatus(query.studentId, grant, query.deviceId);
  }

  @Get('books/:id/files')
  @RequirePermission('book.read')
  files(
    @Param('id', ParseUUIDPipe) id: string,
    @Grant('book.read') grant: GrantedPermission,
  ) {
    return this.service.listFiles(id, grant);
  }

  @Post('books/:id/files')
  @RequirePermission('book.manage')
  addFile(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddBookFileDto) {
    return this.service.addFile(id, dto);
  }

  @Post('books/:id/publish')
  @RequirePermission('book.manage')
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @Grant('book.manage') grant: GrantedPermission,
  ) {
    return this.service.publish(id, grant);
  }

  // --- Physical library ---

  @Get('library/items')
  @RequirePermission('library.item.read')
  libraryItems(@Query() query: ListLibraryQuery) {
    return this.service.listLibraryItems(query.q);
  }

  @Post('library/items')
  @RequirePermission('library.item.manage')
  createItem(@Body() dto: CreateLibraryItemDto) {
    return this.service.createLibraryItem(dto);
  }

  @Post('library/loans')
  @RequirePermission('library.loan.manage')
  issue(@Body() dto: IssueLoanDto) {
    return this.service.issueLoan(dto);
  }

  @Post('library/loans/:id/return')
  @HttpCode(200)
  @RequirePermission('library.loan.manage')
  returnLoan(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReturnLoanDto) {
    return this.service.returnLoan(id, dto);
  }
}

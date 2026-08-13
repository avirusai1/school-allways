import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsOptional, IsUUID } from 'class-validator';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import type { GrantedPermission } from '../../common/context/request-context';
import { ApiException } from '../../common/errors/api.exception';
import { Grant, RequirePermission } from '../../common/rbac/permission.decorator';
import { BooksService } from '../books/books.service';
import { ExamsService } from '../exams/exams.service';
import { FamilyFeesQuery } from '../fees/dto/fees.dto';
import { FeesService } from '../fees/fees.service';
import { TransportService } from '../transport/transport.service';
import { SubscriptionAccessService, SubscriptionLockedException } from '../../common/rbac/subscription-access.service';
import {
  FamilyChildProfileDto,
  FamilyHomeQuery,
  FamilyLeaveListQuery,
  FamilyLeaveRequestDto,
} from './dto/family.dto';
import { FamilyService } from './family.service';

class FamilyResultsQuery {
  @IsUUID()
  studentId!: string;

  @IsOptional() @IsUUID()
  academicSessionId?: string;

  @IsOptional() @IsUUID()
  examId?: string;
}

class FamilyBooksQuery {
  @IsUUID()
  studentId!: string;

  @IsOptional() @IsUUID()
  academicSessionId?: string;

  @IsOptional() @IsUUID()
  subjectId?: string;
}

class FamilyBusQuery {
  @IsUUID()
  studentId!: string;
}

@Controller('family')
export class FamilyController {
  constructor(
    private readonly service: FamilyService,
    private readonly feesService: FeesService,
    private readonly examsService: ExamsService,
    private readonly booksService: BooksService,
    private readonly transportService: TransportService,
    private readonly subscriptions: SubscriptionAccessService,
  ) {}

  /** Parent home feed — one round-trip. */
  @Get('home')
  @RequirePermission('family.child.read')
  home(
    @Query() query: FamilyHomeQuery,
    @Grant('family.child.read') grant: GrantedPermission,
  ) {
    return this.service.home(query.studentId, grant);
  }

  @Get('children')
  @RequirePermission('family.child.read')
  children(@Grant('family.child.read') grant: GrantedPermission) {
    return this.service.listChildren(grant);
  }

  @Get('fees')
  @RequirePermission('family.child.read')
  async feeOverview(
    @Query() query: FamilyFeesQuery,
    @Grant('family.child.read') grant: GrantedPermission,
  ) {
    await this.subscriptions.assertSubscribed(query.studentId);
    return this.feesService.familyFeesOverview(query.studentId, grant);
  }

  /** Poll after app backgrounding during online checkout. */
  @Get('payments/:id')
  @RequirePermission('family.fee.pay')
  async payment(
    @Param('id', ParseUUIDPipe) id: string,
    @Grant('family.fee.pay') grant: GrantedPermission,
  ) {
    const payment = await this.feesService.getPaymentForFamily(id, grant);
    const studentId = (payment as { studentId?: string }).studentId;
    if (!studentId) {
      throw new SubscriptionLockedException('unknown');
    }
    await this.subscriptions.assertSubscribed(studentId);
    return payment;
  }

  /**
   * Published results only — ExamsService gates on isPublished for self scope.
   */
  @Get('results')
  @RequirePermission('exam.marks.read')
  async results(
    @Query() query: FamilyResultsQuery,
    @Grant('exam.marks.read') grant: GrantedPermission,
  ) {
    await this.subscriptions.assertSubscribed(query.studentId);
    return this.examsService.getResults(query.studentId, grant, {
      academicSessionId: query.academicSessionId,
      examId: query.examId,
    });
  }

  /** Digital shelf — audience-mapped books only. */
  @Get('books')
  @RequirePermission('book.read')
  async books(
    @Query() query: FamilyBooksQuery,
    @Grant('book.read') grant: GrantedPermission,
  ) {
    await this.subscriptions.assertSubscribed(query.studentId);
    return this.booksService.listBooks(grant, {
      studentId: query.studentId,
      academicSessionId: query.academicSessionId,
      subjectId: query.subjectId,
    });
  }

  @Get('bus')
  @RequirePermission('family.child.read')
  async bus(
    @Query() query: FamilyBusQuery,
    @Grant('family.child.read') grant: GrantedPermission,
  ) {
    await this.subscriptions.assertSubscribed(query.studentId);
    return this.transportService.familyBusForStudent(query.studentId, grant);
  }

  /**
   * Completing the child's details after a join link. Ownership is the scope
   * grant's job — `self` carries only this guardian's children.
   */
  @Patch('children/:studentId/profile')
  @RequirePermission('family.child.profile.manage')
  updateChildProfile(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() dto: FamilyChildProfileDto,
    @Grant('family.child.profile.manage') grant: GrantedPermission,
  ) {
    return this.service.updateChildProfile(studentId, dto, grant);
  }

  @Post('children/:studentId/photo')
  @RequirePermission('family.child.profile.manage')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: tmpdir(),
        filename: (_req, file, cb) => cb(null, `${randomUUID()}-${file.originalname}`),
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadChildPhoto(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Grant('family.child.profile.manage') grant: GrantedPermission,
  ) {
    if (!file?.path && !file?.buffer?.length) {
      throw new ApiException(400, 'NO_FILE', 'Choose a photo to upload.');
    }
    try {
      return await this.service.uploadChildPhoto(studentId, file, grant);
    } finally {
      if (file.path) await unlink(file.path).catch(() => undefined);
    }
  }

  @Post('children/:studentId/document')
  @RequirePermission('family.child.profile.manage')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: tmpdir(),
        filename: (_req, file, cb) => cb(null, `${randomUUID()}-${file.originalname}`),
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadChildDocument(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('docType') docType: string,
    @Body('title') title: string | undefined,
    @Grant('family.child.profile.manage') grant: GrantedPermission,
  ) {
    if (!file?.path && !file?.buffer?.length) {
      throw new ApiException(400, 'NO_FILE', 'Choose a document to upload.');
    }
    try {
      return await this.service.uploadChildDocument(
        studentId,
        file,
        docType ?? '',
        title,
        grant,
      );
    } finally {
      if (file.path) await unlink(file.path).catch(() => undefined);
    }
  }

  @Post('leave')
  @RequirePermission('family.leave.request')
  requestLeave(
    @Body() dto: FamilyLeaveRequestDto,
    @Grant('family.leave.request') grant: GrantedPermission,
  ) {
    return this.service.requestLeave(dto, grant);
  }

  @Get('leave')
  @RequirePermission('family.leave.request')
  listLeave(
    @Query() query: FamilyLeaveListQuery,
    @Grant('family.leave.request') grant: GrantedPermission,
  ) {
    return this.service.listLeaveRequests(query.studentId, grant);
  }
}

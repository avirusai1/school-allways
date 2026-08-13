import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';

import type { GrantedPermission } from '../../common/context/request-context';
import { Grant, RequirePermission } from '../../common/rbac/permission.decorator';
import { SubscriptionAccessService } from '../../common/rbac/subscription-access.service';
import {
  CreateDiaryDto,
  CreateHomeworkDto,
  GradeHomeworkBodyDto,
  HomeworkFeedQuery,
  HomeworkStudentActionDto,
  ListDiaryQuery,
  ListHomeworkQuery,
  SubmitHomeworkBodyDto,
} from './dto/homework.dto';
import { HomeworkService } from './homework.service';

@Controller()
export class HomeworkController {
  constructor(
    private readonly service: HomeworkService,
    private readonly subscriptions: SubscriptionAccessService,
  ) {}

  @Get('homework')
  @RequirePermission('homework.read')
  list(
    @Query() query: ListHomeworkQuery,
    @Grant('homework.read') grant: GrantedPermission,
  ) {
    // Parents use /homework/feed. The teacher list is unscoped for `self` and
    // would otherwise return the tenant's homework without a paywall.
    if (grant.scope === 'self') return { data: [], meta: { hasMore: false, count: 0, nextCursor: null } };
    return this.service.list(query, grant);
  }

  @Get('homework/feed')
  @RequirePermission('homework.read')
  async feed(
    @Query() query: HomeworkFeedQuery,
    @Grant('homework.read') grant: GrantedPermission,
  ) {
    const ids = this.resolveFeedStudentIds(query.studentId, grant);
    const allowed = await this.gateSelfStudents(grant, ids, query.studentId);
    if (allowed.length === 0) return { data: [] };
    return this.service.feed(allowed, grant);
  }

  @Post('homework')
  @RequirePermission('homework.manage')
  create(
    @Body() dto: CreateHomeworkDto,
    @Grant('homework.manage') grant: GrantedPermission,
  ) {
    return this.service.create(dto, grant);
  }

  @Post('homework/:id/seen')
  @RequirePermission('homework.read')
  async seen(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: HomeworkStudentActionDto,
    @Grant('homework.read') grant: GrantedPermission,
  ) {
    await this.assertSelfSubscribed(grant, body.studentId);
    return this.service.markSeen(id, body.studentId, grant);
  }

  @Post('homework/:id/submit')
  @RequirePermission('homework.read')
  async submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SubmitHomeworkBodyDto,
    @Grant('homework.read') grant: GrantedPermission,
  ) {
    await this.assertSelfSubscribed(grant, body.studentId);
    const { studentId, ...dto } = body;
    return this.service.submit(id, studentId, dto, grant);
  }

  @Post('homework/:id/grade')
  @RequirePermission('homework.grade')
  grade(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: GradeHomeworkBodyDto,
    @Grant('homework.grade') grant: GrantedPermission,
  ) {
    const { studentId, ...dto } = body;
    return this.service.grade(id, studentId, dto, grant);
  }

  @Get('diary')
  @RequirePermission('diary.read')
  async listDiary(
    @Query() query: ListDiaryQuery,
    @Grant('diary.read') grant: GrantedPermission,
  ) {
    const ids = this.resolveFeedStudentIds(query.studentId, grant);
    const allowed = await this.gateSelfStudents(grant, ids, query.studentId);
    if (allowed.length === 0) return { data: [] };
    return this.service.listDiary(allowed, query, grant);
  }

  @Post('diary')
  @RequirePermission('diary.manage')
  createDiary(
    @Body() dto: CreateDiaryDto,
    @Grant('diary.manage') grant: GrantedPermission,
  ) {
    return this.service.createDiary(dto, grant);
  }

  private resolveFeedStudentIds(
    studentId: string | undefined,
    grant: GrantedPermission,
  ): string[] {
    if (studentId) return [studentId];
    if (grant.scope === 'self' && (grant.studentIds?.length ?? 0) > 0) {
      return grant.studentIds!;
    }
    throw new BadRequestException(
      'studentId is required unless you have a self-scoped homework grant with linked children.',
    );
  }

  /** Teachers are never subscription-gated. Parents are. */
  private async assertSelfSubscribed(grant: GrantedPermission, studentId: string) {
    if (grant.scope !== 'self') return;
    await this.subscriptions.assertSubscribed(studentId);
  }

  private async gateSelfStudents(
    grant: GrantedPermission,
    ids: string[],
    explicitStudentId: string | undefined,
  ): Promise<string[]> {
    if (grant.scope !== 'self') return ids;
    if (explicitStudentId) {
      await this.subscriptions.assertSubscribed(explicitStudentId);
      return ids;
    }
    const map = await this.subscriptions.statusForStudents(ids);
    return ids.filter((id) => map.get(id)?.subscribed === true);
  }
}

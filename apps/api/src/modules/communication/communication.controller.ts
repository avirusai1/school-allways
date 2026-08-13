import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';

import { RequirePermission } from '../../common/rbac/permission.decorator';
import { CommunicationService } from './communication.service';
import {
  CreateAnnouncementDto,
  CreateThreadDto,
  ListAnnouncementsQuery,
  PublishAnnouncementDto,
  SendMessageDto,
} from './dto/communication.dto';

@Controller()
export class CommunicationController {
  constructor(private readonly service: CommunicationService) {}

  @Get('announcements')
  @RequirePermission('comms.announcement.read')
  listAnnouncements(@Query() query: ListAnnouncementsQuery) {
    return this.service.listAnnouncements(query);
  }

  @Post('announcements')
  @RequirePermission('comms.announcement.create')
  createAnnouncement(@Body() dto: CreateAnnouncementDto) {
    return this.service.createAnnouncement(dto);
  }

  @Post('announcements/:id/publish')
  @RequirePermission('comms.announcement.publish')
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublishAnnouncementDto,
  ) {
    return this.service.publish(id, dto.scheduledFor);
  }

  @Post('announcements/:id/acknowledge')
  @RequirePermission('comms.announcement.read')
  acknowledge(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.acknowledge(id);
  }

  @Get('announcements/:id/delivery')
  @RequirePermission('comms.delivery.read')
  delivery(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.delivery(id);
  }

  @Get('threads')
  @RequirePermission('comms.thread.read')
  listThreads(@Query('studentId') studentId?: string) {
    return this.service.listThreads(studentId);
  }

  @Post('threads')
  @RequirePermission('comms.message.send')
  createThread(@Body() dto: CreateThreadDto) {
    return this.service.createThread(dto);
  }

  @Get('threads/:id/messages')
  @RequirePermission('comms.thread.read')
  listMessages(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.service.listMessages(id, cursor);
  }

  @Post('threads/:id/messages')
  @RequirePermission('comms.message.send')
  sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
    @Headers('x-client-mutation-id') mutationId?: string,
  ) {
    return this.service.sendMessage(id, dto, mutationId);
  }

  @Post('threads/:id/read')
  @RequirePermission('comms.thread.read')
  markRead(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.markThreadRead(id);
  }
}

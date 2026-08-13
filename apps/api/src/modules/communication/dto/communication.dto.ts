import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PaginatedQuery } from '../../../common/dto/paginated.query';

export class ListAnnouncementsQuery extends PaginatedQuery {
  @IsOptional()
  @IsIn([
    'circular',
    'notice',
    'event',
    'holiday',
    'emergency',
    'fee_reminder',
    'exam',
    'ptm',
    'achievement',
    'general',
  ])
  type?: string;

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  unread?: boolean;
}

export class CreateAnnouncementDto {
  @IsIn([
    'circular',
    'notice',
    'event',
    'holiday',
    'emergency',
    'fee_reminder',
    'exam',
    'ptm',
    'achievement',
    'general',
  ])
  type: string = 'general';

  @IsOptional() @IsIn(['low', 'normal', 'high', 'critical'])
  priority: 'low' | 'normal' | 'high' | 'critical' = 'normal';

  @IsString() @MinLength(1) @MaxLength(200)
  title!: string;

  @IsString() @MinLength(1)
  body!: string;

  @IsIn([
    'all',
    'all_parents',
    'all_staff',
    'all_students',
    'class',
    'section',
    'role',
    'individual',
    'transport_route',
    'custom_list',
  ])
  audienceType!: string;

  @IsOptional() @IsObject()
  audienceRefs?: Record<string, string[]>;

  @IsOptional() @IsArray()
  channels?: string[];

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  requiresAcknowledgement?: boolean;

  @IsOptional() @IsUUID()
  branchId?: string;
}

export class PublishAnnouncementDto {
  @IsOptional()
  scheduledFor?: string | null;
}

export class CreateThreadDto {
  @IsUUID()
  studentId!: string;

  @IsArray()
  @IsUUID('4', { each: true })
  participantUserIds!: string[];

  @IsOptional() @IsString() @MaxLength(200)
  subject?: string;
}

export class SendMessageDto {
  @IsString() @MinLength(1) @MaxLength(4000)
  body!: string;

  @IsOptional() @IsArray()
  attachmentPaths?: string[];
}

import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class SyncStatusQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  cursor?: number;

  @IsOptional() @IsString() @MinLength(1)
  deviceId?: string;

  @IsOptional() @IsString()
  entities?: string;
}

export class SyncPullQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  cursor?: number;

  @IsOptional() @IsString()
  entities?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500)
  limit?: number;

  @IsOptional() @IsString() @MinLength(1)
  deviceId?: string;
}

export class SyncAckDto {
  @Type(() => Number) @IsInt() @Min(0)
  cursor!: number;

  @IsArray() @ArrayMinSize(1) @IsString({ each: true })
  entities!: string[];

  @IsOptional() @IsString() @MinLength(1)
  deviceId?: string;
}

export const SYNC_ENTITY_TYPES = [
  'homework',
  'announcements',
  'marks',
] as const;

export type SyncEntityType = (typeof SYNC_ENTITY_TYPES)[number];

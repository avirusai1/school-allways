import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsUUID,
  ValidateIf,
} from 'class-validator';

const MAX_BULK = 500;

export class BulkIssueAccountsDto {
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) @ArrayMaxSize(MAX_BULK)
  ids?: string[];

  @ValidateIf((o: BulkIssueAccountsDto) => !o.ids?.length)
  @IsOptional() @Type(() => Boolean) @IsBoolean()
  all?: boolean;

  @IsOptional() @IsUUID()
  sectionId?: string;

  @IsOptional() @IsUUID()
  classId?: string;
}

export const BULK_ISSUE_MAX = MAX_BULK;

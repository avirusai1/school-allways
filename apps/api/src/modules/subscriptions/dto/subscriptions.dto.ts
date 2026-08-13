import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

import { PaginatedQuery } from '../../../common/dto/paginated.query';

export class ListSubscriptionsQuery extends PaginatedQuery {
  @IsOptional() @IsUUID()
  classId?: string;

  @IsOptional() @IsUUID()
  sectionId?: string;

  @IsOptional() @IsString() @MaxLength(100)
  q?: string;
}

export class ManualActivateItemDto {
  @IsUUID()
  studentId!: string;

  @IsOptional() @IsString() @MaxLength(300)
  notes?: string;
}

export class ManualActivateDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ManualActivateItemDto)
  items!: ManualActivateItemDto[];
}

import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { PaginatedQuery } from '../../../common/dto/paginated.query';

export class ListStudentsQuery extends PaginatedQuery {
  @IsOptional() @IsUUID()
  sectionId?: string;

  @IsOptional() @IsUUID()
  classId?: string;

  @IsOptional() @IsUUID()
  academicSessionId?: string;

  @IsOptional() @IsString() @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(['active', 'admitted', 'transferred_out', 'passed_out', 'on_leave'])
  status?: string;

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  isRteStudent?: boolean;

  @IsOptional() @IsIn(['name', 'rollNo', 'admissionNo', 'createdAt'])
  sort: 'name' | 'rollNo' | 'admissionNo' | 'createdAt' = 'name';

  @IsOptional() @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'asc';
}

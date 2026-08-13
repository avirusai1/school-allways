import { IsIn, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

import type { ColumnMapping } from '../import.types';

export class UploadImportDto {
  @IsUUID()
  branchId!: string;

  @IsIn(['students', 'staff'])
  entity!: 'students' | 'staff';

  @IsOptional()
  @IsString()
  vendor?: string;
}

export class MapImportDto {
  @IsObject()
  mapping!: ColumnMapping;

  @IsOptional()
  @IsString()
  vendor?: string;
}

export class CommitImportDto {
  @IsOptional()
  partialCommit?: boolean;
}

export class ListImportQuery {
  @IsUUID()
  branchId!: string;
}

export class TemplateQuery {
  @IsIn(['students', 'staff'])
  entity!: 'students' | 'staff';
}

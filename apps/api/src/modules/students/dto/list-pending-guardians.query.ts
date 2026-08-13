import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ListPendingGuardiansQuery {
  @IsOptional() @IsUUID()
  academicSessionId?: string;

  @IsOptional() @IsUUID()
  sectionId?: string;

  @IsOptional() @IsUUID()
  classId?: string;

  @IsOptional() @IsString() @MaxLength(100)
  q?: string;
}

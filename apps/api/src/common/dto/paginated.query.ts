import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Base class every list query extends. Keyset pagination only — never OFFSET. */
export class PaginatedQuery {
  @IsOptional() @IsString() @MaxLength(500)
  cursor?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit = 50;

  @IsOptional() @IsString() @MaxLength(500)
  fields?: string;
}

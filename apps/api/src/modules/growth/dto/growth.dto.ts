import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateReferralDto {
  @IsOptional() @IsString() @MaxLength(200)
  invitedSchoolName?: string;

  @IsOptional() @IsString() @MaxLength(15)
  invitedContactPhone?: string;
}

export class NpsRespondDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(10)
  score!: number;

  @IsOptional() @IsString() @MaxLength(1000)
  comment?: string;
}

export class MonthlyReportParams {
  @IsString() @MinLength(7) @MaxLength(7)
  month!: string; // YYYY-MM
}

export class ExportDto {
  @IsOptional() @IsUUID()
  academicSessionId?: string;
}

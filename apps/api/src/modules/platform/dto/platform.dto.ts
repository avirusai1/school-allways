import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateFlagDto {
  @IsString() @MinLength(1) @MaxLength(80)
  key!: string;

  @IsString() @MinLength(1) @MaxLength(150)
  name!: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsString() @MaxLength(10)
  moduleCode?: string;

  @IsOptional() @IsIn(['boolean', 'percentage', 'allowlist', 'config'])
  kind?: 'boolean' | 'percentage' | 'allowlist' | 'config';

  @IsOptional()
  defaultValue?: unknown;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100)
  rolloutPercentage?: number;
}

export class FlagOverrideDto {
  @IsUUID()
  tenantId!: string;

  value!: unknown;

  @IsOptional() @IsDateString()
  expiresAt?: string;

  @IsString() @MinLength(5) @MaxLength(500)
  reason!: string;
}

export class FlagKillDto {
  @Type(() => Boolean) @IsBoolean()
  enabled!: boolean;
}

export class CreateSupportSessionDto {
  @IsUUID()
  tenantId!: string;

  @IsString() @MinLength(20) @MaxLength(2000)
  reason!: string;

  @IsOptional() @IsString() @MaxLength(60)
  ticketRef?: string;

  @IsOptional() @IsIn(['read_only', 'read_write'])
  accessLevel?: 'read_only' | 'read_write';

  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(240)
  durationMinutes?: number;

  @IsOptional() @IsUUID()
  impersonatedUserId?: string;

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  requiresSchoolApproval?: boolean;
}

export class CreateAnnouncementDto {
  @IsString() @MinLength(1) @MaxLength(200)
  title!: string;

  @IsString() @MinLength(1)
  body!: string;

  @IsOptional() @IsIn(['release', 'maintenance', 'incident', 'compliance', 'marketing'])
  kind?: string;

  @IsOptional()
  targetPlanCodes?: string[];

  @IsOptional()
  targetHealthBands?: string[];

  @IsOptional()
  targetTenantIds?: string[];

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  isBlocking?: boolean;
}

export class SchoolsQuery {
  @IsOptional() @IsIn([
    'not_started',
    'onboarding',
    'activated',
    'healthy',
    'at_risk',
    'churning',
    'dormant',
  ])
  band?: string;

  @IsOptional() @IsString()
  q?: string;
}

export class MetricsRangeQuery {
  @IsOptional() @IsDateString()
  from?: string;

  @IsOptional() @IsDateString()
  to?: string;
}

export class FleetSeriesQuery {
  /**
   * Capped at a year: the response is one row per day and the chart cannot
   * usefully draw more, so an unbounded window is only ever a way to make the
   * console slow.
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365)
  days?: number;
}

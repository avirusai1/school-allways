import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class PublicSignupDto {
  @IsString() @MinLength(3) @MaxLength(200)
  schoolName!: string;

  @IsIn(['cbse', 'icse', 'ib', 'cambridge', 'state_other', 'other'])
  board!: string;

  @IsString() @MinLength(2) @MaxLength(100)
  city!: string;

  @IsString() @MinLength(2) @MaxLength(100)
  state!: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50000)
  approxStudentCount?: number;

  @IsString() @MinLength(2) @MaxLength(150)
  contactName!: string;

  @IsString() @MinLength(10) @MaxLength(15)
  contactPhone!: string;

  @IsEmail() @MaxLength(254)
  contactEmail!: string;

  @IsOptional() @IsString() @MaxLength(20)
  referralCode?: string;
}

export class VerifySignupDto {
  @IsString() @MinLength(4) @MaxLength(8)
  code!: string;
}

export class CompleteStepDto {
  /**
   * Spec uses started / completed / skipped.
   * `complete` / `skip` kept as aliases for older clients.
   */
  @IsIn(['started', 'complete', 'completed', 'skip', 'skipped'])
  action!: 'started' | 'complete' | 'completed' | 'skip' | 'skipped';

  @IsOptional()
  data?: Record<string, unknown>;

  /** Client-tracked seconds on this step — stored on onboarding_events. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(86_400)
  durationSeconds?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  itemCount?: number;
}

export class InviteStaffDto {
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) @ArrayMaxSize(500)
  userIds?: string[];

  @IsOptional()
  all?: boolean;
}

export class InviteParentsDto {
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) @ArrayMaxSize(200)
  sectionIds?: string[];

  @IsOptional() @IsArray() @IsUUID('4', { each: true }) @ArrayMaxSize(500)
  guardianIds?: string[];

  @ValidateIf((o: InviteParentsDto) => !o.sectionIds?.length && !o.guardianIds?.length)
  @IsOptional()
  all?: boolean;
}

export class CallbackRequestDto {
  @IsOptional() @IsString() @MaxLength(100)
  preferredTime?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  note?: string;
}

import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PaginatedQuery } from '../../../common/dto/paginated.query';

const VISITOR_PURPOSES = [
  'parent_meeting',
  'admission_enquiry',
  'vendor',
  'contractor',
  'official',
  'interview',
  'delivery',
  'alumni',
  'other',
] as const;

export class CreateVisitorDto {
  @IsString() @MinLength(1) @MaxLength(150)
  fullName!: string;

  @IsOptional() @IsString() @MaxLength(15)
  phone?: string;

  @IsOptional() @IsString()
  photoPath?: string;

  @IsOptional() @IsString() @MaxLength(30)
  idType?: string;

  /** Last 4 only — never a full ID number. */
  @IsOptional() @IsString() @MinLength(4) @MaxLength(4)
  idLast4?: string;

  @IsOptional() @IsString() @MaxLength(150)
  organisation?: string;

  @IsOptional() @IsIn([...VISITOR_PURPOSES])
  purpose?: (typeof VISITOR_PURPOSES)[number];

  @IsOptional() @IsUUID()
  hostStaffId?: string;

  @IsOptional() @IsUUID()
  studentId?: string;

  @IsOptional() @IsString() @MaxLength(30)
  badgeNo?: string;

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  checkInNow?: boolean;
}

export class PreRegisterVisitorDto extends CreateVisitorDto {
  @IsOptional() @IsDateString()
  expectedAt?: string;
}

export class CreateGatePassDto {
  @IsOptional() @IsUUID()
  studentId?: string;

  @IsOptional() @IsUUID()
  staffId?: string;

  @IsDateString()
  day!: string;

  @IsIn(['late_arrival', 'early_exit', 'temporary_exit'])
  passType!: string;

  @IsOptional() @IsString() @MaxLength(8)
  exitTime?: string;

  @IsOptional() @IsString() @MaxLength(8)
  returnTime?: string;

  @IsOptional() @IsString()
  reason?: string;

  @IsOptional() @IsString() @MaxLength(150)
  collectedByName?: string;
}

export class CreateAuthorisedPickupDto {
  @IsUUID()
  studentId!: string;

  @IsString() @MinLength(1) @MaxLength(150)
  fullName!: string;

  /** Photo is mandatory — guards match a face, not a name. */
  @IsString() @MinLength(1)
  photoPath!: string;

  @IsOptional() @IsString() @MaxLength(50)
  relation?: string;

  @IsOptional() @IsString() @MaxLength(15)
  phone?: string;

  @IsOptional() @IsString() @MaxLength(30)
  idType?: string;

  @IsOptional() @IsString() @MinLength(4) @MaxLength(4)
  idLast4?: string;

  @IsOptional() @IsUUID()
  guardianId?: string;

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  isPermanent?: boolean;

  @IsOptional() @IsDateString()
  validFrom?: string;

  @IsOptional() @IsDateString()
  validTo?: string;
}

export class PickupOtpDto {
  @IsUUID()
  authorisedPickupId!: string;
}

export class PickupVerifyDto {
  @IsOptional() @IsString() @MinLength(4) @MaxLength(12)
  otp?: string;

  @IsOptional() @IsUUID()
  authorisedPickupId?: string;

  @IsOptional() @IsUUID()
  studentId?: string;
}

export class PickupHandoverDto {
  @IsUUID()
  studentId!: string;

  @IsIn(['parent', 'authorised_person', 'school_bus', 'self', 'private_transport', 'staff_ward'])
  method!: string;

  @IsOptional() @IsUUID()
  authorisedPickupId?: string;

  @IsOptional() @IsIn(['qr', 'otp', 'photo_match', 'manual_override'])
  verificationMethod?: string;

  /** Required (≥20 chars) when verificationMethod is manual_override. */
  @IsOptional() @IsString()
  overrideReason?: string;

  @IsOptional() @IsString()
  capturedPhotoPath?: string;
}

export class ListVisitorsQuery extends PaginatedQuery {
  @IsOptional() @IsDateString()
  day?: string;
}

export class AuthorisedPickupQuery {
  @IsUUID()
  studentId!: string;
}

import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Mirrors `bloodGroupEnum`, minus 'unknown' — that is the absence of an answer. */
export const BLOOD_GROUPS = [
  'a_pos', 'a_neg', 'b_pos', 'b_neg', 'ab_pos', 'ab_neg', 'o_pos', 'o_neg',
] as const;

export class FamilyHomeQuery {
  @IsUUID()
  studentId!: string;
}

export class FamilyLeaveRequestDto {
  @IsUUID()
  studentId!: string;

  @IsDateString()
  fromDate!: string;

  @IsDateString()
  toDate!: string;

  @IsString()
  @MinLength(10, { message: 'Reason must be at least 10 characters' })
  reason!: string;

  @IsOptional()
  @IsString()
  attachmentPath?: string;

  @IsOptional()
  @IsUUID()
  clientMutationId?: string;
}

export class FamilyLeaveListQuery {
  @IsUUID()
  studentId!: string;
}

/**
 * What a parent fills in after tapping their invitation link. Every field is
 * optional because the form only ever shows what the school's import left
 * blank — a school that already had addresses on file should not make its
 * parents retype them.
 */
export class FamilyChildProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  district?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @Matches(/^[1-9][0-9]{5}$/, { message: 'Enter a valid 6-digit pincode.' })
  pincode?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsIn(BLOOD_GROUPS, { message: 'Choose a blood group from the list.' })
  bloodGroup?: string;

  /** Storage key returned by the photo upload endpoint, not a raw file. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  photoPath?: string;
}

import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class ApplyTemplateDto {
  @IsIn(['cbse', 'icse', 'state'])
  board!: 'cbse' | 'icse' | 'state';

  @IsUUID()
  branchId!: string;

  @IsUUID()
  academicSessionId!: string;

  @IsArray()
  @IsIn(['classes', 'subjects', 'grading_scale', 'terms'], { each: true })
  include!: Array<'classes' | 'subjects' | 'grading_scale' | 'terms'>;

  @IsOptional() @IsInt() @Min(-3) @Max(12)
  fromClassLevel = -3;

  @IsOptional() @IsInt() @Min(-3) @Max(12)
  toClassLevel = 12;
}

export class CreateSessionDto {
  @IsUUID()
  branchId!: string;

  @IsString()
  name!: string;

  @IsString()
  startDate!: string;

  @IsString()
  endDate!: string;

  @IsOptional()
  isCurrent?: boolean;
}

export class CreateClassDto {
  @IsUUID()
  branchId!: string;

  @IsString()
  name!: string;

  @IsInt() @Min(-3) @Max(12)
  level!: number;

  @IsOptional() @IsString()
  stage?: string;

  @IsOptional() @IsString()
  stream?: string;
}

export class CreateSectionDto {
  @IsUUID()
  branchId!: string;

  @IsUUID()
  classId!: string;

  @IsUUID()
  academicSessionId!: string;

  @IsString()
  name!: string;

  @IsOptional() @IsInt() @Min(1)
  capacity?: number;
}

export class CreateSubjectDto {
  @IsUUID()
  branchId!: string;

  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional() @IsString()
  type?: string;

  @IsOptional() @IsBoolean()
  isScholastic?: boolean;
}

/** One section chip in the classes editor. */
export class BatchSectionDto {
  @IsString()
  name!: string;

  @IsOptional() @IsInt() @Min(1)
  capacity?: number;
}

export class BatchClassRowDto {
  @IsOptional() @IsUUID()
  id?: string;

  @IsString()
  name!: string;

  @IsInt() @Min(-3) @Max(12)
  level!: number;

  @IsOptional() @IsString()
  stage?: string;

  @IsOptional() @IsString()
  stream?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchSectionDto)
  sections!: BatchSectionDto[];
}

/** One request replaces/creates the class+section set for the session. */
export class BatchSaveClassesDto {
  @IsUUID()
  branchId!: string;

  @IsUUID()
  academicSessionId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BatchClassRowDto)
  classes!: BatchClassRowDto[];
}

export class BatchSubjectRowDto {
  @IsOptional() @IsUUID()
  id?: string;

  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsIn(['core', 'elective', 'language', 'co_curricular', 'optional'])
  type!: string;

  @IsBoolean()
  isScholastic!: boolean;

  @IsArray()
  @IsUUID(undefined, { each: true })
  classIds!: string[];
}

export class BatchSaveSubjectsDto {
  @IsUUID()
  branchId!: string;

  @IsUUID()
  academicSessionId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BatchSubjectRowDto)
  subjects!: BatchSubjectRowDto[];
}

export class RolloverPromotionRulesDto {
  @IsIn(['promote', 'detain'])
  defaultAction!: 'promote' | 'detain';

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  detained?: string[];

  @IsOptional() @IsInt() @Min(1) @Max(12)
  graduatingClassLevel?: number;
}

export class RolloverCarryForwardDto {
  @IsOptional() @IsBoolean()
  rollNumbers?: boolean;

  @IsOptional() @IsBoolean()
  houses?: boolean;

  @IsOptional() @IsBoolean()
  transport?: boolean;

  @IsOptional() @IsBoolean()
  concessions?: boolean;
}

export class RolloverDto {
  @IsString()
  targetSessionName!: string;

  @IsOptional() @IsString()
  targetStartDate?: string;

  @IsOptional() @IsString()
  targetEndDate?: string;

  @ValidateNested()
  @Type(() => RolloverPromotionRulesDto)
  promotionRules!: RolloverPromotionRulesDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => RolloverCarryForwardDto)
  carryForward?: RolloverCarryForwardDto;
}

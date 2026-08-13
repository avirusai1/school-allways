import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
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
  ValidateNested,
} from 'class-validator';

import { PaginatedQuery } from '../../../common/dto/paginated.query';

const CONCESSION_TYPES = [
  'sibling',
  'staff_ward',
  'rte',
  'sc_st',
  'ews',
  'merit',
  'sports',
  'single_parent',
  'financial_aid',
  'management',
  'other',
] as const;

const PAYMENT_MODES = [
  'cash',
  'cheque',
  'dd',
  'upi',
  'card',
  'netbanking',
  'wallet',
  'bank_transfer',
  'adjustment',
  'waiver',
] as const;

const FREQUENCIES = [
  'one_time',
  'monthly',
  'quarterly',
  'term',
  'half_yearly',
  'annual',
] as const;

export class CreateFeeHeadDto {
  @IsString() @MinLength(1) @MaxLength(30)
  code!: string;

  @IsString() @MinLength(1) @MaxLength(100)
  name!: string;

  @IsOptional() @IsString() @MaxLength(40)
  category?: string;

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  isOptional?: boolean;

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  isRefundable?: boolean;

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  allowsConcession?: boolean;

  @IsOptional() @IsString() @MaxLength(40)
  ledgerCode?: string;

  @IsOptional() @Type(() => Number) @IsInt()
  sequence?: number;
}

export class PatchFeeHeadDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100)
  name?: string;

  @IsOptional() @IsString() @MaxLength(40)
  category?: string;

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  isOptional?: boolean;

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  isRefundable?: boolean;

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  allowsConcession?: boolean;

  @IsOptional() @IsString() @MaxLength(40)
  ledgerCode?: string;

  @IsOptional() @Type(() => Number) @IsInt()
  sequence?: number;

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  isActive?: boolean;
}

export class FeeStructureItemDto {
  @IsUUID()
  feeHeadId!: string;

  @IsOptional() @IsUUID()
  termId?: string;

  @Type(() => Number) @IsInt() @Min(0)
  amountPaise!: number;

  @IsOptional() @IsIn([...FREQUENCIES])
  frequency?: (typeof FREQUENCIES)[number];

  @IsOptional() @IsDateString()
  dueDate?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  lateFeePerDayPaise?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  lateFeeMaxPaise?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  graceDays?: number;
}

export class CreateFeeStructureDto {
  @IsUUID()
  academicSessionId!: string;

  @IsOptional() @IsUUID()
  classId?: string;

  @IsString() @MinLength(1) @MaxLength(120)
  name!: string;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional() @IsDateString()
  effectiveTo?: string;

  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => FeeStructureItemDto)
  items!: FeeStructureItemDto[];

  @IsOptional() @IsString()
  hikeJustification?: string;
}

export class ApproveStructureDto {
  @IsOptional() @IsString() @MaxLength(2000)
  hikeJustification?: string;

  @IsOptional() @IsString()
  approvalDocumentPath?: string;
}

export class StructurePreviewQuery {
  @IsUUID()
  classId!: string;

  @IsOptional() @IsUUID()
  studentId?: string;
}

export class CreateConcessionDto {
  @IsUUID()
  studentId!: string;

  @IsUUID()
  academicSessionId!: string;

  @IsIn([...CONCESSION_TYPES])
  type!: (typeof CONCESSION_TYPES)[number];

  @IsOptional() @IsUUID()
  feeHeadId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10_000)
  percentageBp?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  flatAmountPaise?: number;

  @IsOptional() @IsString()
  reason?: string;

  @IsOptional() @IsString()
  documentPath?: string;

  @IsOptional() @IsDateString()
  validFrom?: string;

  @IsOptional() @IsDateString()
  validTo?: string;
}

export class ListConcessionsQuery extends PaginatedQuery {
  @IsOptional() @IsUUID()
  studentId?: string;

  @IsOptional() @IsUUID()
  academicSessionId?: string;
}

export class GenerateInvoicesDto {
  @IsUUID()
  academicSessionId!: string;

  @IsUUID()
  termId!: string;

  @IsArray() @ArrayMinSize(1) @IsUUID('4', { each: true })
  classIds!: string[];

  @IsDateString()
  issueDate!: string;

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  dryRun?: boolean;
}

export class PaymentAllocationDto {
  @IsUUID()
  invoiceId!: string;

  @IsOptional() @IsUUID()
  invoiceLineId?: string;

  @Type(() => Number) @IsInt() @Min(1)
  amountPaise!: number;
}

export class CollectPaymentDto {
  @IsUUID()
  studentId!: string;

  @IsDateString()
  paymentDate!: string;

  @Type(() => Number) @IsInt() @Min(1)
  amountPaise!: number;

  @IsIn([...PAYMENT_MODES])
  mode!: (typeof PAYMENT_MODES)[number];

  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => PaymentAllocationDto)
  allocations!: PaymentAllocationDto[];

  @IsOptional() @IsString() @MaxLength(100)
  referenceNo?: string;

  @IsOptional() @IsString() @MaxLength(120)
  bankName?: string;

  @IsOptional() @IsDateString()
  instrumentDate?: string;

  @IsOptional() @IsString()
  remarks?: string;

  @IsOptional() @IsUUID()
  clientMutationId?: string;
}

export class InitiateOnlinePaymentDto {
  @IsArray() @ArrayMinSize(1) @IsUUID('4', { each: true })
  invoiceIds!: string[];

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  amountPaise?: number;

  @IsOptional() @IsUUID()
  clientMutationId?: string;
}

export class GatewayWebhookDto {
  @IsString()
  gatewayPaymentId!: string;

  @IsOptional() @IsString()
  gatewayOrderId?: string;

  /** Required when Redis order cache has expired — never taken from a client header alone for auth. */
  @IsOptional() @IsUUID()
  tenantId?: string;

  @IsIn(['success', 'failed'])
  status!: 'success' | 'failed';

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  amountPaise?: number;

  @IsOptional() @IsString()
  signature?: string;

  @IsOptional()
  raw?: Record<string, unknown>;
}

export class RefundPaymentDto {
  @Type(() => Number) @IsInt() @Min(1)
  amountPaise!: number;

  @IsOptional() @IsString()
  reason?: string;
}

export class ImportSettlementsDto {
  /** CSV text: valueDate,netAmountPaise,narration,sourceRef */
  @IsString() @MinLength(1)
  csv!: string;

  @IsOptional() @IsIn(['bank_statement', 'gateway_payout', 'cash_deposit'])
  source?: string;
}

export class MatchSettlementDto {
  @IsArray() @ArrayMinSize(1) @IsUUID('4', { each: true })
  paymentIds!: string[];
}

export class DaybookQuery {
  @IsDateString()
  day!: string;

  @IsOptional() @IsString() @MaxLength(60)
  counter?: string;
}

export class CloseDaybookDto {
  @IsDateString()
  day!: string;

  @IsOptional() @IsString() @MaxLength(60)
  counterName?: string;

  @Type(() => Number) @IsInt()
  countedClosingCashPaise!: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  cashDepositedPaise?: number;

  @IsOptional() @IsString() @MaxLength(2000)
  varianceNote?: string;

  /** Required when variance ≠ 0 — accountant acknowledges the gap. */
  @IsOptional() @Type(() => Boolean) @IsBoolean()
  acknowledgeVariance?: boolean;
}

export class DefaultersQuery extends PaginatedQuery {
  @IsOptional() @Type(() => Number) @IsInt() @IsIn([0, 30, 60, 90, 120])
  ageingBucket?: number;

  @IsOptional() @IsUUID()
  classId?: string;
}

export class RemindDefaultersDto {
  @IsArray() @ArrayMinSize(1) @IsUUID('4', { each: true })
  invoiceIds!: string[];

  @Type(() => Number) @IsInt() @Min(1) @Max(4)
  ladderStep!: number;
}

export class PromiseToPayDto {
  @IsDateString()
  promiseToPayDate!: string;

  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;
}

export class StudentFeeStatusQuery {
  @IsUUID()
  studentId!: string;

  @IsOptional() @IsUUID()
  academicSessionId?: string;
}

export class FamilyFeesQuery {
  @IsUUID()
  studentId!: string;
}

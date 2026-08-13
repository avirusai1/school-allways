import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class GeneratePlatformInvoiceDto {
  @IsIn(['manual_activations', 'stay_connected'])
  kind!: 'manual_activations' | 'stay_connected';
}

export class SuspendTenantDto {
  @IsString() @MinLength(20) @MaxLength(2000)
  reason!: string;
}

export class UnsuspendTenantDto {
  @IsString() @MinLength(10) @MaxLength(2000)
  reason!: string;
}

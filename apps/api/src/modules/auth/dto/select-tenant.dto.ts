import { IsOptional, IsUUID } from 'class-validator';

export class SelectTenantDto {
  @IsUUID()
  tenantId!: string;

  @IsOptional() @IsUUID()
  branchId?: string;
}

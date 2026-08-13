import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class PrincipalDashboardQuery {
  /** Defaults to today in IST. Present so yesterday can be reviewed. */
  @IsOptional() @IsDateString()
  day?: string;

  /** Defaults to the branch on the session token. */
  @IsOptional() @IsUUID()
  branchId?: string;
}

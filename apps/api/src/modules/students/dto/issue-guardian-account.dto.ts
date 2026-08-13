import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class IssueGuardianAccountDto {
  /** Omit for phone-only front-desk credentials when the guardian has a phone on file. */
  @IsOptional() @IsEmail()
  email?: string;

  @IsOptional() @IsString() @MinLength(8) @MaxLength(128)
  password?: string;
}

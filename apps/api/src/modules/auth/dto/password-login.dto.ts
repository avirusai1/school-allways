import { IsEmail, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

const PHONE_REGEX = /^91[6-9]\d{9}$/;

export class PasswordLoginDto {
  @ValidateIf((o: PasswordLoginDto) => !o.phone)
  @IsEmail()
  email?: string;

  @ValidateIf((o: PasswordLoginDto) => !o.email)
  @Matches(PHONE_REGEX, { message: 'Phone must be a valid Indian mobile number (91XXXXXXXXXX)' })
  phone?: string;

  @IsString() @MinLength(8) @MaxLength(128)
  password!: string;
}

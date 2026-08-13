import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';

const PHONE_REGEX = /^91[6-9]\d{9}$/;

export class VerifyOtpDto {
  @ValidateIf((o: VerifyOtpDto) => !o.email)
  @Matches(PHONE_REGEX)
  phone?: string;

  @ValidateIf((o: VerifyOtpDto) => !o.phone)
  @IsEmail()
  email?: string;

  @Matches(/^\d{6}$/)
  code!: string;

  @IsIn(['login', 'signup', 'phone_change', 'guardian_consent'])
  purpose!: 'login' | 'signup' | 'phone_change' | 'guardian_consent';

  @IsOptional() @IsString() @MaxLength(100)
  deviceId?: string;

  @IsOptional() @IsString() @MaxLength(150)
  deviceName?: string;

  @IsOptional() @IsIn(['android', 'ios', 'web'])
  platform?: 'android' | 'ios' | 'web';

  @IsOptional() @IsString() @MaxLength(30)
  appVersion?: string;
}

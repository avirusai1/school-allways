import { IsEmail, IsIn, Matches, ValidateIf } from 'class-validator';

const PHONE_REGEX = /^91[6-9]\d{9}$/;

export class RequestOtpDto {
  @ValidateIf((o: RequestOtpDto) => !o.email)
  @Matches(PHONE_REGEX, { message: 'Phone must be a valid Indian mobile number (91XXXXXXXXXX)' })
  phone?: string;

  @ValidateIf((o: RequestOtpDto) => !o.phone)
  @IsEmail()
  email?: string;

  @IsIn(['login', 'signup', 'phone_change', 'guardian_consent'])
  purpose!: 'login' | 'signup' | 'phone_change' | 'guardian_consent';
}

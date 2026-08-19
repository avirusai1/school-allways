import { IsString, MaxLength, MinLength } from 'class-validator';

import { MIN_PASSWORD_LENGTH } from '../../../common/auth/password.util';

export class ActivateJoinDto {
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  })
  @MaxLength(128)
  password!: string;
}

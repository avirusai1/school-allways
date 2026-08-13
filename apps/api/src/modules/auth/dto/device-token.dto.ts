import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDeviceTokenDto {
  @IsString()
  @MinLength(8)
  @MaxLength(4096)
  fcmToken!: string;

  @IsIn(['android', 'ios', 'web'])
  platform!: 'android' | 'ios' | 'web';

  @IsIn(['family', 'admin'])
  appId!: 'family' | 'admin';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceId?: string;
}

export class UnregisterDeviceTokenDto {
  @IsString()
  @MinLength(8)
  @MaxLength(4096)
  fcmToken!: string;
}

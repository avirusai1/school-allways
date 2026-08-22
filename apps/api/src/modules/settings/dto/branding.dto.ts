import { IsHexColor, IsOptional } from 'class-validator';

export class UpdateBrandingDto {
  /** #RRGGBB. Null clears the override back to the platform default blue. */
  @IsOptional()
  @IsHexColor()
  primaryColor?: string | null;
}

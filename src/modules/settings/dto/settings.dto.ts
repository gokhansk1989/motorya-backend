import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional() @IsBoolean()
  maintenance_mode?: boolean;

  @IsOptional() @IsBoolean()
  new_registrations?: boolean;

  @IsOptional() @IsBoolean()
  new_listings?: boolean;

  @IsOptional() @IsBoolean()
  offer_system?: boolean;
}

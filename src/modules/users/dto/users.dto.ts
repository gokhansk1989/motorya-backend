import { IsString, IsOptional, IsUrl, IsBoolean, MinLength, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}

export class UpdateNotificationPrefsDto {
  @IsOptional() @IsBoolean()
  offers?: boolean;

  @IsOptional() @IsBoolean()
  messages?: boolean;

  @IsOptional() @IsBoolean()
  priceDrops?: boolean;

  @IsOptional() @IsBoolean()
  listingStatus?: boolean;
}

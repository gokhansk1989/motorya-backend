import { IsString, IsOptional, IsUrl, IsBoolean, IsDateString, IsIn, Length, Matches, MinLength, MaxLength } from 'class-validator';

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
  @IsString()
  district?: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  // Kayıt sırasında doldurmayan kullanıcı ilan vermeden önce buradan tamamlayabilir.
  @IsOptional()
  @IsString()
  @Length(11, 11, { message: 'TC Kimlik numarası 11 haneli olmalıdır' })
  @Matches(/^[1-9][0-9]{10}$/, { message: 'Geçerli bir TC Kimlik numarası giriniz' })
  tcKimlik?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsIn(['MALE', 'FEMALE', 'OTHER'])
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
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

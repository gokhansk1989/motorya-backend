import { IsBoolean, IsEmail, IsString, IsOptional, IsDateString, IsIn, MinLength, Matches, Length, Equals, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsOptional()
  @IsString()
  turnstileToken?: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  // Herkese acik gorunen ad = KULLANICI ADI. Gercek ad-soyad realName'de
  // saklanir ve yayinlanmaz; bu yuzden burada kimlik bilgisi degil, kisinin
  // sectigi takma ad bekleniyor.
  @IsString()
  @MinLength(3, { message: 'Kullanıcı adı en az 3 karakter olmalı' })
  @MaxLength(20, { message: 'Kullanıcı adı en fazla 20 karakter olabilir' })
  @Matches(/^[a-z0-9._]+$/, {
    message: 'Kullanıcı adı yalnızca küçük harf, rakam, nokta ve alt çizgi içerebilir',
  })
  displayName: string;

  // Gercek ad-soyad: fatura ve kimlik dogrulama icin gerekli, herkese acik
  // hicbir yerde gosterilmez.
  @IsString()
  @MinLength(3, { message: 'Ad soyad en az 3 karakter olmalı' })
  realName: string;

  // İlan vermek isteyene kadar opsiyonel — bkz. ListingsService.createListing
  @IsOptional()
  @IsString()
  @Length(11, 11, { message: 'TC Kimlik numarası 11 haneli olmalıdır' })
  @Matches(/^[1-9][0-9]{10}$/, { message: 'Geçerli bir TC Kimlik numarası giriniz' })
  tcKimlik?: string;

  @IsString()
  @Matches(/^(05)[0-9]{9}$/, { message: 'Geçerli bir Türk cep telefonu giriniz (05XX...)' })
  phone: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsIn(['MALE', 'FEMALE', 'OTHER'])
  gender?: 'MALE' | 'FEMALE' | 'OTHER';

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  district?: string;

  // Üyelik Sözleşmesi ve KVKK onayı zorunlu — kayıt sırasında DB'ye değişmez log olarak yazılır.
  @IsBoolean()
  @Equals(true, { message: "Üyelik Sözleşmesi'ni kabul etmeniz gerekiyor" })
  acceptedTerms: boolean;

  @IsBoolean()
  @Equals(true, { message: "KVKK Aydınlatma Metni'ni kabul etmeniz gerekiyor" })
  acceptedKvkk: boolean;

  @IsOptional()
  @IsBoolean()
  acceptedMarketing?: boolean;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsOptional()
  @IsString()
  turnstileToken?: string;

  // Mobil uygulamadan giriş yapılıyorsa cihaz kaydı + refresh token döner
  @IsOptional()
  @IsIn(['IOS', 'ANDROID'])
  platform?: 'IOS' | 'ANDROID';

  @IsOptional()
  @IsString()
  deviceModel?: string;

  @IsOptional()
  @IsString()
  appVersion?: string;
}

export class RefreshTokenDto {
  @IsString()
  deviceId: string;

  @IsString()
  refreshToken: string;
}

export class LogoutDeviceDto {
  @IsString()
  deviceId: string;
}

export class AuthResponseDto {
  accessToken: string;
  refreshToken?: string;
  deviceId?: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    role: string;
    emailVerifiedAt?: Date | null;
  };
  needsConsent?: boolean;
  needsUsername?: boolean;
}

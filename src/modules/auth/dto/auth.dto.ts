import { IsBoolean, IsEmail, IsString, IsOptional, IsDateString, IsIn, MinLength, Matches, Length, Equals, MaxLength, IsObject} from 'class-validator';

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

  /**
   * Hesabi getiren kampanya. Istemci ziyaret boyunca bellekte tuttugu
   * kampanyayi buraya koyuyor; sunucu normalize edip bir KEZ damgaliyor.
   *
   * Olcum bilgisi: hicbir yetki ya da erisim karari buna bakmiyor,
   * kullanici istedigi degeri gonderebilir.
   */
  @IsOptional()
  @IsObject()
  kampanya?: Record<string, unknown>;

  /**
   * Kayit girisimi kimligi (olcum). Istemci kayit ekrani acildiginda
   * uretiyor ve akis boyunca tasiyor; sunucu olusan hesaba bagliyor ki
   * e-posta dogrulamasi saatler sonra baska bir cihazda yapilsa bile
   * dogru girisime baglanabilsin.
   *
   * YETKI ARACI DEGIL: hicbir karar buna bakmiyor, yalnizca iki olayin
   * ayni girisime ait oldugunu soyluyor. Bicimi olay kimligiyle ayni
   * dogrulamadan geciyor.
   */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9-]{8,64}$/, { message: 'girisimId bicimi gecersiz' })
  girisimId?: string;

  // Opsiyonel.
  //
  // App Store incelemesi 5.1.1(v) ile reddetti: "uygulamanin cekirdek
  // islevi icin gerekli olmayan kisisel bilgi zorunlu tutulamaz". Telefon
  // burada gercekten gerekli degil - ilan vermek icin TC kimlik isteniyor,
  // iletisim mesajlasma uzerinden yuruyor. Isteyen girebilsin diye alan
  // duruyor, ama bos birakilabiliyor.
  @IsOptional()
  @IsString()
  @Matches(/^(05)[0-9]{9}$/, { message: 'Geçerli bir Türk cep telefonu giriniz (05XX...)' })
  phone?: string;

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

/**
 * Yenileme istegi.
 *
 * Alanlar ISTEGE BAGLI: tarayicida token ve cihaz kimligi HttpOnly
 * cerezde geliyor, govde bos. Zorunlu birakilsaydi dogrulama katmani
 * cerezli istegi daha denetleyiciye ulasmadan 400 ile reddederdi.
 *
 * Native uygulama eskisi gibi govdeyle gonderiyor; iki yolu da ayni
 * uc karsiliyor.
 */
export class RefreshTokenDto {
  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsString()
  refreshToken?: string;
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

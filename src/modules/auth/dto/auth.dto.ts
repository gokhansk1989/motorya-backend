import { IsBoolean, IsEmail, IsString, IsOptional, IsDateString, IsIn, MinLength, Matches, Length, Equals } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @MinLength(2)
  displayName: string;

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
}

export class AuthResponseDto {
  accessToken: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    role: string;
  };
}

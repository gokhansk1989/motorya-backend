import { IsEmail, IsString, MinLength, Matches, Length } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @MinLength(2)
  displayName: string;

  @IsString()
  @Length(11, 11, { message: 'TC Kimlik numarası 11 haneli olmalıdır' })
  @Matches(/^[1-9][0-9]{10}$/, { message: 'Geçerli bir TC Kimlik numarası giriniz' })
  tcKimlik: string;

  @IsString()
  @Matches(/^(05)[0-9]{9}$/, { message: 'Geçerli bir Türk cep telefonu giriniz (05XX...)' })
  phone: string;
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
  };
}

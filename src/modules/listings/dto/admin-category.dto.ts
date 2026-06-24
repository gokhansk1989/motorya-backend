import { IsBoolean, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

// iconKey/logoUrl bir görsel adresi (http(s):// veya / ile başlayan path) olmalı —
// eski seed verisinde 'helmet' gibi anlamsız anahtar kelimeler vardı, bunları tekrar engelliyoruz.
const URL_OR_PATH = /^(https?:\/\/|\/)/;

export class CreateCategoryDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsString()
  @MaxLength(100)
  slug: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(URL_OR_PATH, { message: 'iconKey geçerli bir URL veya yol olmalı (http(s):// veya / ile başlamalı)' })
  iconKey?: string;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  slug?: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(URL_OR_PATH, { message: 'iconKey geçerli bir URL veya yol olmalı (http(s):// veya / ile başlamalı)' })
  iconKey?: string;
}

export class CreateBrandDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsString()
  @MaxLength(100)
  slug: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(URL_OR_PATH, { message: 'logoUrl geçerli bir URL veya yol olmalı (http(s):// veya / ile başlamalı)' })
  logoUrl?: string;
}

export class UpdateBrandDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(URL_OR_PATH, { message: 'logoUrl geçerli bir URL veya yol olmalı (http(s):// veya / ile başlamalı)' })
  logoUrl?: string;
}

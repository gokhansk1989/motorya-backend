import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';

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

export class SetFeaturedDto {
  @IsBoolean()
  isFeatured: boolean;

  // isFeatured: true gönderildiğinde kaç gün öne çıkacağı — varsayılan 7
  @IsOptional()
  @IsInt()
  @Min(1)
  days?: number;

  /**
   * Vitrin icindeki elle sira. Kucuk sayi one gelir. `null` gonderilirse
   * sira kaldirilir ve ilan sirasizlarin arasina, en yeniden eskiye
   * dizilen gruba doner. Alan hic gonderilmezse mevcut sira KORUNUR -
   * sureyi uzatmak istedigi icin tiklayan yoneticinin sirayi sessizce
   * silmesini onluyor.
   */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(9999)
  sira?: number | null;
}

/**
 * Vitrin sirasinin topluca kaydedilmesi.
 *
 * Neden ayri bir uc: sirayi `feature` ucundan kaydetmek, her
 * surukleme isleminde vitrin suresini de uzatirdi. Sira ile sure
 * birbirinden bagimsiz iki karar.
 */
export class VitrinSirasiDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => VitrinSiraSatiriDto)
  sira!: VitrinSiraSatiriDto[];
}

export class VitrinSiraSatiriDto {
  @IsString()
  @MaxLength(64)
  id!: string;

  @IsInt()
  @Min(0)
  @Max(9999)
  sira!: number;
}

import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsISO8601, IsInt, IsNumber, IsObject, IsOptional, IsPositive, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ListingCondition, ListingGender, ListingStatus } from '@prisma/client';

/** Fiyat ust siniri: Decimal(12,2) kolonuna sigacak, gercekci bir ust deger. */
export const FIYAT_UST_SINIRI = 9_999_999;

export class CreateListingDto {
  @IsString()
  @MinLength(5)
  @MaxLength(100)
  title: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description: string;

  @IsString()
  categoryId: string;

  @IsOptional()
  @IsString()
  brandId?: string;

  @IsEnum(ListingCondition)
  condition: ListingCondition;

  @IsOptional()
  @IsEnum(ListingGender)
  gender?: ListingGender;

  @IsOptional()
  @IsString()
  sizeLabel?: string;

  // @IsPositive sifir ve negatifi zaten reddediyor. Ust sinir eksikti:
  // Decimal(12,2) kolonuna sigmayan bir sayi Postgres'te hata uretip 500'e
  // donusuyordu. Sinir kolonun kapasitesinin altinda tutuluyor.
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(FIYAT_UST_SINIRI)
  price: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(FIYAT_UST_SINIRI)
  originalPrice?: number;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString({ each: true })
  imageUrls?: string[];

  /**
   * Adres -> kadraj eslemesi. Icerigi sunucuda `kadrajHaritasiniCoz`
   * ile dogrulaniyor; buradaki gevsek kontrol yalnizca turu tutuyor.
   */
  @IsOptional()
  @IsObject()
  imageCrops?: Record<string, unknown>;

  /**
   * Kapak olarak secilen fotografin adresi.
   *
   * Diziye degil ADRESE bagli: siralama degisince kapak kaymiyor.
   * Gonderilmezse ya da listede yoksa ilk fotograf kapak olur.
   */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  coverUrl?: string;
}

export class UpdateListingDto {
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  brandId?: string;

  @IsOptional()
  @IsEnum(ListingCondition)
  condition?: ListingCondition;

  @IsOptional()
  @IsEnum(ListingGender)
  gender?: ListingGender;

  @IsOptional()
  @IsString()
  sizeLabel?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(FIYAT_UST_SINIRI)
  price?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(FIYAT_UST_SINIRI)
  originalPrice?: number;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString({ each: true })
  imageUrls?: string[];

  /**
   * Adres -> kadraj eslemesi. Icerigi sunucuda `kadrajHaritasiniCoz`
   * ile dogrulaniyor; buradaki gevsek kontrol yalnizca turu tutuyor.
   */
  @IsOptional()
  @IsObject()
  imageCrops?: Record<string, unknown>;

  /**
   * Kapak olarak secilen fotografin adresi.
   *
   * Diziye degil ADRESE bagli: siralama degisince kapak kaymiyor.
   * Gonderilmezse ya da listede yoksa ilk fotograf kapak olur.
   */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  coverUrl?: string;
}

export class ListingsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  categorySlug?: string;

  @IsOptional()
  @IsString()
  brandId?: string;

  @IsOptional()
  @IsEnum(ListingCondition)
  condition?: ListingCondition;

  @IsOptional()
  @IsEnum(ListingGender)
  gender?: ListingGender;

  @IsOptional()
  @IsString()
  sizeLabel?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  maxPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(['price_asc', 'price_desc', 'newest', 'oldest'])
  sort?: 'price_asc' | 'price_desc' | 'newest' | 'oldest' = 'newest';

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isFeatured?: boolean;
}

/**
 * Taslak kaydetme. payload serbest bir nesne olarak geliyor ama sunucu
 * onu beyaz listeye gore suzuyor (taslak-alanlari.ts) - istemciye
 * sonradan eklenen bir alan, ornegin T.C. kimlik numarasi, buraya
 * sizamasin.
 */
export class TaslakDto {
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  imageUrls?: string[];

  /** Adres -> kadraj eslemesi (bkz. kadraj.ts). */
  @IsOptional()
  @IsObject()
  imageCrops?: Record<string, unknown>;

  /** Kapak olarak secilen fotografin adresi. */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  coverUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  step?: number;
}

/** Yonetici: test isareti. */
export class TestIsaretiDto {
  @IsBoolean()
  isTest: boolean;
}

/** Yonetici: bekleyen duzenleme onayi. */
export class BekleyenDuzenlemeDto {
  /**
   * Moderatorun gordugu surumun zaman damgasi. Satici inceleme sirasinda
   * duzenlemesini revize etmis olabilir; damga tutmazsa islem
   * reddediliyor, yoksa moderator gormedigi bir icerigi onaylamis olurdu.
   */
  @IsOptional()
  @IsISO8601()
  beklenenSurum?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  nedenKodu?: string;
}

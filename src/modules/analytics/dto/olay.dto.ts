import { IsArray, IsIn, IsObject, IsOptional, IsString, Matches, ValidateNested, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { OLAY_ADLARI } from '../olay-sozlugu';

export class OlayDto {
  /**
   * Istemcinin urettigi benzersiz kimlik (crypto.randomUUID). Tekrar
   * gonderilen ayni olayin iki kez sayilmasini engelliyor.
   */
  @IsString()
  @Matches(/^[A-Za-z0-9-]{8,64}$/, { message: 'eventId bicimi gecersiz' })
  eventId!: string;

  @IsIn(OLAY_ADLARI)
  name!: string;

  /** Tek bir ilan verme girisimini baglayan rastgele kimlik. */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9-]{8,64}$/, { message: 'flowId bicimi gecersiz' })
  flowId?: string;

  /**
   * Alanlar sozluge gore ayrica temizleniyor (propsTemizle). Buradaki gevsek
   * dogrulama yalnizca bicimi tutuyor; icerigin guvenligi sozlukte.
   */
  @IsOptional()
  @IsObject()
  props?: Record<string, unknown>;
}

export class OlayPaketiDto {
  /**
   * Olaylar toplu gonderiliyor: sayfa degistirirken bekleyen olaylar tek
   * istekte cikiyor, her tiklamada ayri HTTP istegi olmuyor.
   */
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => OlayDto)
  olaylar!: OlayDto[];
}

import { BadRequestException } from '@nestjs/common';

/**
 * Ilan gorselleri yalnizca kendi yukleme ucumuzun urettigi adreslerden
 * gelebilir. Once yalnizca @IsString dogrulamasi vardi: kullanici kendi
 * sunucusundaki bir adresi gorsel olarak kaydedip ilani acan herkesin
 * IP'sini ve tarayici bilgisini toplayabiliyordu.
 *
 * Taslak da ayni dogrulamadan geciyor - taslak yolundan bu kontrolu
 * atlatmak mumkun olmamali.
 */
export const YUKLEME_TABANI = () =>
  `${process.env.BASE_URL ?? 'https://motorya.com.tr/api-backend'}/uploads/`;

export function gorselleriDogrula(urls: string[]): void {
  const taban = YUKLEME_TABANI();
  for (const url of urls) {
    if (!url.startsWith(taban)) {
      throw new BadRequestException(
        'Görseller yalnızca Motorya yükleme adresinden gelebilir',
      );
    }
  }
}

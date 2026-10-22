import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { AnalyticsService } from './analytics.service';
import { RaporService } from './rapor.service';
import { OlayPaketiDto } from './dto/olay.dto';
import { OptionalJwtGuard } from '../../common/guards/optional-jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { OLAYLAR } from './olay-sozlugu';
import { AralikDto } from './dto/aralik.dto';

@Controller('analitik')
export class AnalyticsController {
  constructor(
    private analytics: AnalyticsService,
    private rapor: RaporService,
  ) {}

  /**
   * Olay alimi. Anonim kullanici da gonderebiliyor (arama akisi icin gerekli),
   * oturum varsa kullanici kimligi iliskilendiriliyor.
   *
   * 202 donuyor: istemci yaniti beklemiyor, olcumun durumu kullanicinin isini
   * etkilemiyor. Servis hicbir kosulda hata firlatmadigi icin bu uc 4xx/5xx
   * ureterek istemcide hata gosterme riskine girmiyor.
   */
  @Post('olay')
  @UseGuards(OptionalJwtGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(HttpStatus.ACCEPTED)
  async olay(@Body() dto: OlayPaketiDto, @Request() req) {
    return this.analytics.kaydet(dto.olaylar, {
      userId: req.user?.id ?? null,
      role: req.user?.role ?? null,
      isTestAccount: req.user?.isTestAccount ?? null,
      userAgent: req.headers?.['user-agent'] ?? null,
    });
  }

  /** Olay sozlugu — raporda ve belgede metrik tanimlarini gostermek icin. */
  @Get('sozluk')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  sozluk() {
    return Object.entries(OLAYLAR).map(([ad, t]) => ({
      ad,
      aciklama: t.aciklama,
      akisGerekli: 'akisGerekli' in t ? !!t.akisGerekli : false,
      alanlar: t.alanlar,
    }));
  }

  /**
   * Yonetici raporu. Yetkilendirme sunucu tarafinda: panelde menuyu gizlemek
   * yetmez, ucun kendisi rol kontrol ediyor.
   */
  /**
   * Ilan sayimlarinin uzlastirilmasi. Salt okunur, kisisel veri icermez.
   * Raporda farkli gorunen ilan sayilarinin hangi kumeden geldigini
   * gosterir.
   */
  @Get('ilan-uzlastirma')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  ilanUzlastirma(@Query() q: AralikDto) {
    const { baslangic, bitis } = q.coz();
    return this.rapor.ilanUzlastirma(baslangic, bitis);
  }

  @Get('rapor')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  async raporGetir(@Query() q: AralikDto, @Query('kontrolDahil') kontrolDahil?: string) {
    const { baslangic, bitis } = q.coz();
    // Kontrollu test kayitlarini dahil etme YALNIZCA acik istekle.
    // Uc zaten ADMIN/SUPER_ADMIN'e kisitli; ayrica bir rol kontrolu
    // gerekmiyor ama varsayilan her zaman DISLAMA.
    return this.rapor.rapor(baslangic, bitis, kontrolDahil === 'true');
  }
}

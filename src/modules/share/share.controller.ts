import { Controller, Get, Param, Res, Header } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ShareService } from './share.service';

@Controller('share')
export class ShareController {
  constructor(private shareService: ShareService) {}

  // Herkese acik: kart ayni zamanda og:image olarak da kullanilabilsin diye
  // oturum aranmaz. Icerik zaten yayindaki ilanin kendisi.
  // Genel sinir (100/dk) bu ucun maliyetiyle orantili degil: her yeni kart
  // ~1 saniye islemci harciyor ve sunucu iki cekirdekli. Onbellek disinda
  // kalan istekler icin daha dar bir sinir koyuyoruz.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('listing/:slug.png')
  @Header('Content-Type', 'image/png')
  @Header('Cache-Control', 'public, max-age=3600')
  async ilanKarti(@Param('slug') slug: string, @Res() res: Response) {
    const png = await this.shareService.ilanKarti(slug);
    res.end(png);
  }
}

import { Controller, Get, Param, Res, Header } from '@nestjs/common';
import type { Response } from 'express';
import { ShareService } from './share.service';

@Controller('share')
export class ShareController {
  constructor(private shareService: ShareService) {}

  // Herkese acik: kart ayni zamanda og:image olarak da kullanilabilsin diye
  // oturum aranmaz. Icerik zaten yayindaki ilanin kendisi.
  @Get('listing/:slug.png')
  @Header('Content-Type', 'image/png')
  @Header('Cache-Control', 'public, max-age=3600')
  async ilanKarti(@Param('slug') slug: string, @Res() res: Response) {
    const png = await this.shareService.ilanKarti(slug);
    res.end(png);
  }
}

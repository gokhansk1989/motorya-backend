import { Controller, Post, Req, Headers, HttpCode, Logger } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { ErrorLogsService } from './error-logs.service';

/**
 * Sentry → bizim Hata Loglari.
 *
 * Sentry'de yeni bir issue olustugunda (Internal Integration webhook'u)
 * buraya POST atiyor; biz onu ErrorLog'a source='sentry' ile yaziyoruz.
 * Boylece panel tek merkez: kendi yakaladiklarimiz + Sentry'nin
 * zengin yakaladiklari (detay/replay icin Sentry linkiyle).
 *
 * GUVENLIK: uc herkese acik (Sentry oturum tasimaz), bu yuzden her
 * istek Sentry'nin HMAC imzasiyla dogrulaniyor. Imza tutmazsa sessizce
 * yok sayiliyor -- sahte hata basilamaz.
 */
@Controller('sentry-webhook')
export class SentryWebhookController {
  private readonly logger = new Logger(SentryWebhookController.name);

  constructor(private errorLogs: ErrorLogsService) {}

  @Post()
  @HttpCode(202)
  async al(
    @Req() req: RawBodyRequest<Request>,
    @Headers('sentry-hook-signature') imza?: string,
    @Headers('sentry-hook-resource') kaynak?: string,
  ) {
    const secret = process.env.SENTRY_WEBHOOK_SECRET;
    // Secret tanimli degilse webhook'u KABUL ETMIYORUZ: imzasiz bir uc
    // sahte hata basmaya acik olurdu.
    if (!secret) return { ok: false };

    const ham = req.rawBody;
    if (!ham || !imza) return { ok: false };

    const beklenen = createHmac('sha256', secret).update(ham).digest('hex');
    // Sabit zamanli karsilastirma (timing saldirisina kapali).
    const a = Buffer.from(imza);
    const b = Buffer.from(beklenen);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false };

    // Yalnizca issue (hata) olaylari ilgilendiriyor.
    if (kaynak && kaynak !== 'issue') return { ok: true };

    try {
      const govde = JSON.parse(ham.toString('utf8'));
      const issue = govde?.data?.issue ?? govde?.data?.event;
      if (!issue) return { ok: true };

      const baslik = String(issue.title ?? issue.metadata?.value ?? 'Sentry hatasi').slice(0, 300);
      const link = issue.web_url ?? issue.url ?? null;
      const proje = issue.project?.slug ?? issue.project ?? govde?.data?.project_slug ?? null;

      await this.errorLogs.log({
        source: 'sentry',
        message: baslik,
        path: issue.culprit ? String(issue.culprit).slice(0, 200) : null,
        // Govde SAKLANMIYOR; yalnizca ustveri + Sentry linki (detay orada).
        context: { url: link, proje, sayi: issue.count ?? undefined, seviye: issue.level ?? undefined },
      });
    } catch (e: any) {
      this.logger.warn(`Sentry webhook ayristirilamadi: ${e?.message}`);
    }
    return { ok: true };
  }
}

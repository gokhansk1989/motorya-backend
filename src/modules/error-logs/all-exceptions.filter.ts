import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorLogsService } from './error-logs.service';

// Backend'de oluşan hataları (login, ilan verme, vb. herhangi bir endpoint) otomatik
// olarak ErrorLog tablosuna kaydeder, ardından normal NestJS HTTP yanıtını bozmadan döner.
// - 5xx / yakalanmamış exception -> source 'api' (gerçek sunucu hatası)
// - 429 (ThrottlerGuard limit aşımı) -> source 'rate-limit' (kötüye kullanım/bot tespiti)
// - 404 -> source '404' (kırık link / silinmiş kaynak raporu)
// Diğer 4xx (validasyon, yetkisiz erişim vb. beklenen istemci hataları) loglanmaz.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private errorLogs: ErrorLogsService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = isHttpException ? exception.getResponse() : { message: 'Internal server error' };

    const source = status >= 500 ? 'api' : status === 429 ? 'rate-limit' : status === 404 ? '404' : null;

    // 404 gurultusunu filtrele: bot/tarayıcı istekleri (favicon, .git,
    // meta tag'lerden URL uretimi, root path) log'a yazilmaz.
    if (source === '404' && !this.shouldLog404(request?.originalUrl ?? '', request?.headers?.referer as string | undefined)) {
      response.status(status).json(typeof body === 'string' ? { message: body } : body);
      return;
    }

    if (source) {
      const err = exception as Error;
      this.errorLogs.log({
        source,
        message: err?.message ?? (typeof body === 'string' ? body : (body as any)?.message) ?? 'Unknown error',
        stack: source === 'api' ? err?.stack ?? null : null,
        path: request?.originalUrl,
        method: request?.method,
        statusCode: status,
        userId: (request as any)?.user?.id ?? null,
        context: source === 'rate-limit' ? { ip: request?.ip } : undefined,
      });
    }

    response.status(status).json(typeof body === 'string' ? { message: body } : body);
  }

  // 404'lerde mantik TERSINE cevrildi.
  //
  // Onceden "gurultulu desenleri" sayan bir liste vardi; tarayicilar surekli
  // yeni yol deniyor ve liste hep geriden geliyordu. Uretimde 11.047 hata
  // kaydinin 10.349'u (%94) bu sekilde birikmis bot 404'uydu - gercek hatalar
  // aralarinda kayboluyordu.
  //
  // Artik yalnizca BIZIM olabilecek 404'ler kaydediliyor:
  //   - sitemizden gelen bir baglanti kirildiysa (referer kendi alan adimiz)
  //   - ya da yol, uygulamanin gercek rota desenlerinden birine benziyorsa
  // Geri kalan her sey (wp-admin, .env, /metrics, rastgele tarama) yazilmaz.
  private shouldLog404(url: string, referer?: string): boolean {
    const yol = (url || '').split('?')[0];

    // Kendi sayfamizdan gelen tiklama: gercek kirik baglanti, mutlaka gorelim
    if (referer && /^https?:\/\/(www\.)?motorya\.com\.tr/.test(referer)) return true;

    // Uygulamanin gercek rota desenleri
    const bizimRotalar = /^\/(ilan|kategori|kullanici|blog|sayfa|ara|ilan-ver|ilanlarim|favoriler|mesajlarim|tekliflerim|bildirimler|profilim|fiyat-alarm|sss)(\/|$)/;
    if (bizimRotalar.test(yol)) return true;

    // Onay bekleyen ilanin sayfasi acildiginda by-slug 404 doner: sunucu
    // onaylanmamis ilani vermiyor, sayfa istemci tarafinda sahibine
    // gosteriliyor. Yani bu bir hata degil, tasarimin kendisi - kayda
    // yazmak gurultu uretiyordu (bir gunde 4 ornek olctuk).
    if (yol.startsWith('/listings/by-slug')) return false;

    // API tarafinda gercekten var olabilecek kaynaklar
    if (/^\/(listings|users|offers|messages|blog|categories|brands)(\/|$)/.test(yol)) return true;

    return false;
  }
}

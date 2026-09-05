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
    if (source === '404' && this.isNoisy404(request?.originalUrl ?? '', request?.headers?.['user-agent'] as string | undefined)) {
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

  // Gerçek kullanicidan gelmeyen 404 desenleri
  private isNoisy404(url: string, ua?: string): boolean {
    // Favicon, root, git config, sitemap variantlari
    if (/^\/(favicon\.(ico|png)|robots\.txt|sitemap.*\.xml|\.git|\.env|\.well-known|apple-touch-icon)/.test(url)) return true;
    if (url === '/' || url === '') return true;
    // /pages/ altinda meta tag scrape'i yapan bot istekleri (SEO tarayicilari)
    if (/^\/pages\/[^a-z]/i.test(url)) return true;
    if (/^\/pages\/(tr_TR|website|index|width=|Motorya|\d)/.test(url)) return true;
    if (/^\/pages\/[^\/]{80,}/.test(url)) return true;
    // Bilinen bot user-agent'lari
    if (ua && /nmap|nikto|sqlmap|masscan|shodan|censys|zgrab|python-requests\/2/i.test(ua)) return true;
    return false;
  }
}

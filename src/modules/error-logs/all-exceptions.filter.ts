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
}

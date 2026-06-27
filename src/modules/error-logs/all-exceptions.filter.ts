import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorLogsService } from './error-logs.service';

// Backend'de oluşan HER hatayı (login, ilan verme, vb. herhangi bir endpoint) otomatik
// olarak ErrorLog tablosuna kaydeder, ardından normal NestJS HTTP yanıtını bozmadan döner.
// 4xx (validasyon, yetkisiz erişim vb. beklenen istemci hataları) loglanmaz — sadece
// gerçek sunucu/uygulama hataları (5xx veya yakalanmamış exception) kaydedilir.
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

    if (status >= 500) {
      const err = exception as Error;
      this.errorLogs.log({
        source: 'api',
        message: err?.message ?? 'Unknown error',
        stack: err?.stack ?? null,
        path: request?.originalUrl,
        method: request?.method,
        statusCode: status,
        userId: (request as any)?.user?.id ?? null,
      });
    }

    response.status(status).json(typeof body === 'string' ? { message: body } : body);
  }
}

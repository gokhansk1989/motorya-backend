import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { tap } from 'rxjs/operators';
import { ErrorLogsService } from './error-logs.service';

const SLOW_THRESHOLD_MS = 2000;

// Hata fırlatmayan ama kullanıcı deneyimini bozan yavaş istekleri yakalar
// (örn. ağır arama sorguları, büyük resim işleme). source: 'slow-api'.
@Injectable()
export class SlowRequestInterceptor implements NestInterceptor {
  constructor(private errorLogs: ErrorLogsService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<Request>();
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - start;
        if (duration > SLOW_THRESHOLD_MS) {
          this.errorLogs.log({
            source: 'slow-api',
            message: `${request.method} ${request.originalUrl} — ${duration}ms`,
            path: request.originalUrl,
            method: request.method,
            context: { duration },
          });
        }
      }),
    );
  }
}

import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from './modules/prisma/prisma.service';
import { collectSystemMetrics, evaluateHealth } from './common/system-metrics';

@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  /**
   * Kaynak alarmı — UptimeRobot bu adresi izliyor.
   *
   * Alarmın sunucunun DIŞINDAN gelmesi şart: admin paneli de aynı makinede
   * çalıştığı için RAM tükendiğinde ilk cevap vermeyi kesen şey panelin
   * kendisi oluyor. Eşik aşılınca 503 dönüyoruz, UptimeRobot mevcut
   * e-posta/SMS bildirimini tetikliyor — yeni altyapı gerekmiyor.
   *
   * Yanıt bilerek sade: hangi kontrolün düştüğünü söylüyor ama kapasite
   * rakamlarını vermiyor (uç nokta herkese açık). Ayrıntılı değerler
   * kimlik doğrulamalı /admin/system'de.
   */
  @Get('resources')
  resources() {
    const { healthy, failing } = evaluateHealth(collectSystemMetrics());
    if (!healthy) {
      throw new HttpException(
        { status: 'critical', failing, timestamp: new Date().toISOString() },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get()
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: 'connected',
      };
    } catch (e) {
      return {
        status: 'error',
        database: 'disconnected',
        error: e.message,
      };
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(private prisma: PrismaService) {}

  // Her 30 dakikada süresi dolan rezervasyonları kontrol et
  @Cron(CronExpression.EVERY_30_MINUTES)
  async expireReservedListings() {
    const expired = await this.prisma.listing.findMany({
      where: {
        status: 'RESERVED',
        reservedUntil: { lte: new Date() },
        deletedAt: null,
      },
      select: { id: true, title: true, sellerId: true },
    });

    if (expired.length === 0) return;

    const ids = expired.map(l => l.id);

    await this.prisma.listing.updateMany({
      where: { id: { in: ids } },
      data: { status: 'ACTIVE', reservedUntil: null },
    });

    // Satıcılara bildirim
    const notifications = expired.map(l => ({
      userId: l.sellerId,
      type: 'listing.reservation_expired',
      title: 'Rezervasyon sona erdi',
      body: `"${l.title}" ilanınızın rezervasyonu süresi doldu. İlan tekrar aktif.`,
      payload: { listingId: l.id },
    }));

    await this.prisma.notification.createMany({ data: notifications });

    this.logger.log(`Expired ${expired.length} reservation(s): ${ids.join(', ')}`);
  }

  // Günlük: süresi dolan teklifleri EXPIRED'a çek
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async expireOffers() {
    const result = await this.prisma.offer.updateMany({
      where: {
        status: { in: ['PENDING', 'COUNTER_OFFERED'] },
        expiresAt: { lte: new Date() },
      },
      data: { status: 'EXPIRED' },
    });

    if (result.count > 0) {
      this.logger.log(`Expired ${result.count} offer(s)`);
    }
  }

  // Günlük: 30 günden eski audit log kayıtlarını sil (saklama süresi)
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async pruneAuditLogs() {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    if (result.count > 0) {
      this.logger.log(`Pruned ${result.count} audit log entr(y/ies) older than 30 days`);
    }
  }
}

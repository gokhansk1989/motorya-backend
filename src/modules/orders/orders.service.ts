import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Emanet durum makinesi — izinli geçişler haritası.
 * Her durum sadece belirli durumlara geçebilir.
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  CREATED: ['AWAITING_PAYMENT', 'CANCELLED'],
  AWAITING_PAYMENT: ['PAID_ESCROW', 'CANCELLED'],
  PAID_ESCROW: ['SHIPPED', 'DISPUTED'],
  SHIPPED: ['DELIVERED', 'DISPUTED'],
  DELIVERED: ['COMPLETED', 'DISPUTED'],
  DISPUTED: ['COMPLETED', 'REFUNDED'],
  COMPLETED: [],
  REFUNDED: [],
  CANCELLED: [],
};

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  /**
   * Sipariş oluştur — CREATED durumundan başlar.
   */
  async createOrder(data: {
    listingId: string;
    buyerId: string;
    sellerId: string;
    amount: Decimal;
    commissionRate?: Decimal;
  }) {
    // Validate listing exists and is ACTIVE
    const listing = await this.prisma.listing.findUnique({
      where: { id: data.listingId },
    });

    if (!listing || listing.status !== 'ACTIVE') {
      throw new BadRequestException('Listing not available');
    }

    // Validate buyer != seller
    if (data.buyerId === data.sellerId) {
      throw new BadRequestException('Cannot buy from yourself');
    }

    const order = await this.prisma.order.create({
      data: {
        listingId: data.listingId,
        buyerId: data.buyerId,
        sellerId: data.sellerId,
        amount: data.amount,
        commissionRate: data.commissionRate || 0,
        commissionAmount: data.amount.mul(data.commissionRate || 0),
        sellerPayout: data.amount.sub(
          data.amount.mul(data.commissionRate || 0),
        ),
        status: 'CREATED',
      },
    });

    // Mark listing as RESERVED
    await this.prisma.listing.update({
      where: { id: data.listingId },
      data: { status: 'RESERVED' },
    });

    return order;
  }

  /**
   * Durum geçişi — guard'ları kontrol edip, yan etkiyi yapıp, state'i güncelle.
   */
  async transitionOrder(
    orderId: string,
    newStatus: OrderStatus,
    context?: {
      trackingNo?: string;
      reason?: string;
      reviewedBy?: string;
    },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { listing: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Guard: Check if transition is allowed
    if (!ALLOWED_TRANSITIONS[order.status].includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition from ${order.status} to ${newStatus}`,
      );
    }

    // Prepare update data
    const updateData: any = { status: newStatus };

    // Add timestamp based on new status
    switch (newStatus) {
      case 'PAID_ESCROW':
        updateData.paidAt = new Date();
        break;
      case 'SHIPPED':
        updateData.shippedAt = new Date();
        break;
      case 'DELIVERED':
        updateData.deliveredAt = new Date();
        break;
      case 'COMPLETED':
        updateData.completedAt = new Date();
        updateData.escrowReleasedAt = new Date();
        // TODO: Trigger Payout creation
        break;
      case 'REFUNDED':
        updateData.escrowReleasedAt = new Date();
        // TODO: Trigger POS refund
        break;
      case 'CANCELLED':
        updateData.cancelledAt = new Date();
        // TODO: Trigger ilan back to ACTIVE
        break;
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: updateData,
    });

    // Side effects
    await this.handleSideEffects(updatedOrder, context);

    return updatedOrder;
  }

  /**
   * Her durum geçişinin yan etkileri — bildirim, ilan durumu, payout, vb.
   */
  private async handleSideEffects(
    order: any,
    context?: any,
  ) {
    switch (order.status) {
      case 'PAID_ESCROW':
        // Bildirim: satıcıya "ödeme alındı, kargolamalısın"
        await this.createNotification(order.sellerId, {
          type: 'order.paid',
          title: 'Sipariş ödenedi',
          body: `Sipariş #${order.id} ödeme alındı. Lütfen kargoyla.`,
        });
        break;

      case 'SHIPPED':
        // Bildirim: alıcıya "kargo yolda"
        await this.createNotification(order.buyerId, {
          type: 'order.shipped',
          title: 'Sipariş kargolandı',
          body: `Sipariş #${order.id} yolda. Takip: ${context?.trackingNo}`,
        });
        break;

      case 'DELIVERED':
        // 3 günlük otomatik onay sayacı başla (BullMQ Job)
        await this.scheduleAutoComplete(order.id, 3 * 24 * 60 * 60 * 1000); // 3 gün
        break;

      case 'COMPLETED':
        // Payout ve komisyon kesintisi
        await this.createPayout(order);
        // Yorum hakkı aç
        break;

      case 'CANCELLED':
        // İlanı ACTIVE'ye geri getir
        if (order.listing) {
          await this.prisma.listing.update({
            where: { id: order.listing.id },
            data: { status: 'ACTIVE' },
          });
        }
        break;

      case 'REFUNDED':
        // POS refund webhook (iyzico/PayTR) tetiklendi
        // İlanı ACTIVE'ye geri getir
        if (order.listing) {
          await this.prisma.listing.update({
            where: { id: order.listing.id },
            data: { status: 'ACTIVE' },
          });
        }
        break;
    }
  }

  /**
   * Anlaşmazlık açma — sipariş DISPUTED'a geçer.
   */
  async openDispute(
    orderId: string,
    openedById: string,
    reason: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Geçiş izni kontrolü
    if (
      ![
        'PAID_ESCROW',
        'SHIPPED',
        'DELIVERED',
      ].includes(order.status)
    ) {
      throw new BadRequestException(
        `Cannot open dispute for order in ${order.status} state`,
      );
    }

    // Geçiş yap
    await this.transitionOrder(orderId, 'DISPUTED');

    // Anlaşmazlık kaydı oluştur
    const dispute = await this.prisma.dispute.create({
      data: {
        orderId,
        openedById,
        reason,
        status: 'OPEN',
      },
    });

    return dispute;
  }

  /**
   * Anlaşmazlık çözme — admin karar verir.
   */
  async resolveDispute(
    disputeId: string,
    resolution: 'REFUND' | 'RELEASE',
    resolvedBy: string,
    note: string,
  ) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    const targetStatus =
      resolution === 'REFUND' ? 'REFUNDED' : 'COMPLETED';

    // Sipariş durum geçişi
    await this.transitionOrder(dispute.orderId, targetStatus as OrderStatus);

    // Anlaşmazlık kaydını güncelle
    const updated = await this.prisma.dispute.update({
      where: { id: disputeId },
      data: {
        status:
          resolution === 'REFUND' ? 'RESOLVED_REFUND' : 'RESOLVED_RELEASE',
        resolvedBy,
        resolutionNote: note,
        resolvedAt: new Date(),
      },
    });

    return updated;
  }

  // ============ Yardımcı metodlar (TODO: gerçekleştirilmek) ============

  private async createNotification(
    userId: string,
    data: { type: string; title: string; body: string },
  ) {
    // TODO: Implement push notification logic
    console.log(`[NOTIFICATION] ${userId}: ${data.title}`);
  }

  private async scheduleAutoComplete(orderId: string, delay: number) {
    // TODO: BullMQ job queue'ye ekle
    console.log(`[SCHEDULE] Auto-complete for order ${orderId} in ${delay}ms`);
  }

  private async createPayout(order: any) {
    // TODO: Payout kaydı oluştur
    console.log(
      `[PAYOUT] Order ${order.id}: seller ${order.sellerId} gets ${order.sellerPayout}`,
    );
  }
}

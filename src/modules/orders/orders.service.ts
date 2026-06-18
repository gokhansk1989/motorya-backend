import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SearchService } from '../search/search.service';
import { OrderStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { buildListingSlug } from '../listings/listings.service';
import { CreateOrderDto, ConfirmCashPaymentDto, ConfirmHandoffDto } from './dto/orders.dto';

/**
 * Emanet durum makinesi — izinli geçişler haritası.
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  CREATED: ['AWAITING_PAYMENT', 'CANCELLED'],
  AWAITING_PAYMENT: ['PAID_ESCROW', 'CANCELLED'],
  PAID_ESCROW: ['SHIPPED', 'DELIVERED', 'DISPUTED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'DISPUTED'],
  DELIVERED: ['COMPLETED', 'DISPUTED'],
  DISPUTED: ['COMPLETED', 'REFUNDED'],
  COMPLETED: [],
  REFUNDED: [],
  CANCELLED: [],
};

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService, private search: SearchService) {}

  async createOrder(buyerId: string, dto: CreateOrderDto) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: dto.listingId },
    });
    if (!listing || listing.status !== 'ACTIVE') {
      throw new BadRequestException('Listing not available');
    }
    if (listing.sellerId === buyerId) {
      throw new BadRequestException('Cannot buy from yourself');
    }

    const amount = dto.amount ? new Decimal(dto.amount) : listing.price;
    const commissionRate = new Decimal(0); // lansmanda 0
    const commissionAmount = amount.mul(commissionRate);
    const sellerPayout = amount.sub(commissionAmount);

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          listingId: listing.id,
          buyerId,
          sellerId: listing.sellerId,
          amount,
          commissionRate,
          commissionAmount,
          sellerPayout,
          paymentMethod: dto.paymentMethod,
          status: 'CREATED',
        },
        include: { listing: { select: { id: true, title: true } } },
      });

      await tx.listing.update({
        where: { id: listing.id },
        data: { status: 'RESERVED' },
      });

      return created;
    });

    // Sipariş oluşturunca ilan aramadan kaldır
    this.search.removeListing(listing.id).catch(() => null);

    await this.notify(order.sellerId, {
      type: 'order.created',
      title: 'Yeni sipariş',
      body: `"${listing.title}" için yeni bir sipariş oluşturuldu.`,
    });

    return order;
  }

  // ───────────────────────────────────────────────
  //  ELDEN ÖDEME AKIŞI
  // ───────────────────────────────────────────────

  /**
   * Alıcı nakit ödeyeceğini onaylar → CREATED → PAID_ESCROW
   * Satıcıya bildirim gider: "Alıcı elden ödeyecek, buluşma ayarlayın."
   */
  async confirmCashPayment(orderId: string, buyerId: string, dto: ConfirmCashPaymentDto) {
    const order = await this.findOrderOrFail(orderId);
    if (order.buyerId !== buyerId) throw new ForbiddenException();
    if (order.paymentMethod !== 'CASH') {
      throw new BadRequestException('This order is not a cash order');
    }
    if (order.status !== 'CREATED') {
      throw new BadRequestException(`Order is already in status: ${order.status}`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Nakit ödeme kaydı
      await tx.payment.create({
        data: {
          orderId,
          provider: 'CASH',
          type: 'CHARGE',
          status: 'SUCCEEDED',
          amount: order.amount,
          currency: order.currency,
        },
      });

      // Buluşma notunu shipment olarak kaydet
      if (dto.meetingNote) {
        await tx.shipment.upsert({
          where: { orderId },
          create: { orderId, meetingNote: dto.meetingNote },
          update: { meetingNote: dto.meetingNote },
        });
      }

      return tx.order.update({
        where: { id: orderId },
        data: { status: 'PAID_ESCROW', paidAt: new Date() },
      });
    });

    await this.notify(order.sellerId, {
      type: 'order.cash_confirmed',
      title: 'Elden ödeme onaylandı',
      body: dto.meetingNote
        ? `Alıcı elden ödemeyi onayladı. Buluşma notu: ${dto.meetingNote}`
        : 'Alıcı elden ödemeyi onayladı. Lütfen buluşma ayarlayın.',
    });

    return updated;
  }

  /**
   * Satıcı teslimi yaptığını bildirir → PAID_ESCROW → DELIVERED
   * Alıcıya bildirim gider: "Ürünü teslim aldıysanız onaylayın."
   */
  async confirmHandoff(orderId: string, sellerId: string, dto: ConfirmHandoffDto) {
    const order = await this.findOrderOrFail(orderId);
    if (order.sellerId !== sellerId) throw new ForbiddenException();
    if (order.paymentMethod !== 'CASH') {
      throw new BadRequestException('Use the shipment flow for online orders');
    }
    if (order.status !== 'PAID_ESCROW') {
      throw new BadRequestException(`Cannot confirm handoff from status: ${order.status}`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.shipment.upsert({
        where: { orderId },
        create: { orderId, meetingNote: dto.meetingNote, shippedAt: new Date(), deliveredAt: new Date() },
        update: { meetingNote: dto.meetingNote ?? undefined, shippedAt: new Date() },
      });

      return tx.order.update({
        where: { id: orderId },
        data: { status: 'DELIVERED', shippedAt: new Date(), deliveredAt: new Date() },
      });
    });

    await this.notify(order.buyerId, {
      type: 'order.handoff_confirmed',
      title: 'Satıcı teslim etti',
      body: 'Satıcı ürünü teslim ettiğini bildirdi. Lütfen teslim alıp onaylayın.',
    });

    return updated;
  }

  /**
   * Alıcı teslim aldığını onaylar → DELIVERED → COMPLETED
   */
  async confirmReceipt(orderId: string, buyerId: string) {
    const order = await this.findOrderOrFail(orderId);
    if (order.buyerId !== buyerId) throw new ForbiddenException();
    if (order.status !== 'DELIVERED') {
      throw new BadRequestException(`Cannot confirm receipt from status: ${order.status}`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.shipment.upsert({
        where: { orderId },
        create: { orderId, deliveredAt: new Date() },
        update: { deliveredAt: new Date() },
      });

      const o = await tx.order.update({
        where: { id: orderId },
        data: { status: 'COMPLETED', completedAt: new Date(), escrowReleasedAt: new Date() },
      });

      // Payout kaydı oluştur
      await tx.payout.create({
        data: {
          orderId,
          sellerId: o.sellerId,
          amount: o.sellerPayout,
          status: 'PENDING',
        },
      });

      // İlanı SOLD olarak işaretle
      await tx.listing.update({
        where: { id: o.listingId },
        data: { status: 'SOLD' },
      });

      return o;
    });

    // Tamamlanan sipariş ilanını aramadan kaldır
    this.search.removeListing(order.listingId).catch(() => null);

    await this.notify(order.sellerId, {
      type: 'order.completed',
      title: 'Sipariş tamamlandı',
      body: 'Alıcı teslim aldığını onayladı. Ödeme işleme alındı.',
    });

    return updated;
  }

  // ───────────────────────────────────────────────
  //  GENEL SIPARŞ İŞLEMLERİ
  // ───────────────────────────────────────────────

  async getOrder(orderId: string, requesterId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        listing: { include: { images: { take: 1 }, category: { include: { parent: { select: { slug: true } } } } } },
        buyer: { select: { id: true, displayName: true, avatarUrl: true } },
        seller: { select: { id: true, displayName: true, avatarUrl: true } },
        shipment: true,
        payments: true,
        dispute: true,
      },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== requesterId && order.sellerId !== requesterId) {
      throw new ForbiddenException();
    }

    return { ...order, listing: order.listing ? { ...order.listing, slug: buildListingSlug(order.listing) } : null };
  }

  async getMyOrders(userId: string, role: 'buyer' | 'seller') {
    const where = role === 'buyer' ? { buyerId: userId } : { sellerId: userId };
    return this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        listing: { include: { images: { take: 1 }, category: { include: { parent: { select: { slug: true } } } } } },
        buyer: { select: { id: true, displayName: true, avatarUrl: true } },
        seller: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });
    return orders.map(o => ({ ...o, listing: o.listing ? { ...o.listing, slug: buildListingSlug(o.listing) } : null }));
  }

  async cancelOrder(orderId: string, requesterId: string) {
    const order = await this.findOrderOrFail(orderId);
    if (order.buyerId !== requesterId && order.sellerId !== requesterId) {
      throw new ForbiddenException();
    }
    if (!['CREATED', 'AWAITING_PAYMENT', 'PAID_ESCROW'].includes(order.status)) {
      throw new BadRequestException(`Cannot cancel order in status: ${order.status}`);
    }
    // PAID_ESCROW → sadece satıcı iptal edebilir (alıcı para iadesi için dispute açmalı)
    if (order.status === 'PAID_ESCROW' && order.sellerId !== requesterId) {
      throw new BadRequestException('Buyer must open a dispute to cancel a paid order');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      const restoredListing = await tx.listing.update({
        where: { id: order.listingId },
        data: { status: 'ACTIVE' },
        include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 }, category: true, brand: true, seller: { select: { id: true, displayName: true } } },
      });
      return { updated, listing: restoredListing };
    }).then(async ({ updated, listing }) => {
      // İlan iptal edilince tekrar aramaya ekle
      this.search.indexListing({
        id: listing.id, title: listing.title, description: listing.description,
        price: Number(listing.price), condition: listing.condition,
        city: listing.city ?? undefined, sizeLabel: listing.sizeLabel ?? undefined,
        categoryId: listing.categoryId, categoryName: (listing.category as any)?.name ?? '',
        brandId: listing.brandId ?? undefined, brandName: (listing.brand as any)?.name ?? undefined,
        sellerId: listing.sellerId, sellerName: (listing.seller as any)?.displayName ?? '',
        imageUrl: (listing.images as any)?.[0]?.url ?? undefined,
        status: 'ACTIVE', createdAt: new Date(listing.createdAt).getTime(),
      }).catch(() => null);
      return updated;
    });
  }

  // Generic transition — online ödeme akışı için kullanılır (payments modülü çağırır)
  async transitionOrder(
    orderId: string,
    newStatus: OrderStatus,
    context?: { trackingNo?: string; reason?: string },
  ) {
    const order = await this.findOrderOrFail(orderId);

    if (!ALLOWED_TRANSITIONS[order.status].includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition from ${order.status} to ${newStatus}`,
      );
    }

    const updateData: any = { status: newStatus };
    if (newStatus === 'PAID_ESCROW') updateData.paidAt = new Date();
    if (newStatus === 'SHIPPED') updateData.shippedAt = new Date();
    if (newStatus === 'DELIVERED') updateData.deliveredAt = new Date();
    if (newStatus === 'COMPLETED') {
      updateData.completedAt = new Date();
      updateData.escrowReleasedAt = new Date();
    }
    if (newStatus === 'CANCELLED') updateData.cancelledAt = new Date();

    return this.prisma.order.update({ where: { id: orderId }, data: updateData });
  }

  // ───────────────────────────────────────────────
  //  YARDIMCI
  // ───────────────────────────────────────────────

  private async findOrderOrFail(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private async notify(userId: string, data: { type: string; title: string; body: string }) {
    await this.prisma.notification.create({
      data: { userId, type: data.type, title: data.title, body: data.body },
    }).catch(() => null);
  }
}

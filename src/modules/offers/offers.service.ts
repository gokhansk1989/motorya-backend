import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SocialService } from '../social/social.service';
import { CreateOfferDto, RespondOfferDto, CounterOfferDto } from './dto/offers.dto';
import { Decimal } from '@prisma/client/runtime/library';
import { buildListingSlug } from '../listings/listings.service';
import { SettingsService } from '../settings/settings.service';
import { WebPushService } from '../users/webpush.service';
import { FcmService } from '../users/fcm.service';
import { MessagesGateway } from '../messages/messages.gateway';
import { MessagesService } from '../messages/messages.service';

// Teklif durumlarının kullanıcıya gösterilecek karşılıkları. Hata metninde
// ham enum ("ACCEPTED") göstermek kullanıcıya bir şey anlatmıyordu.
const OFFER_STATUS_TR: Record<string, string> = {
  PENDING: 'beklemede',
  ACCEPTED: 'kabul edildi',
  REJECTED: 'reddedildi',
  COUNTER_OFFERED: 'karşı teklif verildi',
  WITHDRAWN: 'geri çekildi',
  EXPIRED: 'süresi doldu',
};
const statusTr = (s: string) => OFFER_STATUS_TR[s] ?? s.toLowerCase();

@Injectable()
export class OffersService {
  constructor(
    private prisma: PrismaService,
    private social: SocialService,
    private settings: SettingsService,
    private webPush: WebPushService,
    private fcm: FcmService,
    private chatGateway: MessagesGateway,
    private messages: MessagesService,
  ) {}

  async createOffer(buyerId: string, dto: CreateOfferDto) {
    if (!(await this.settings.get('offer_system'))) {
      throw new ServiceUnavailableException('Teklif sistemi şu anda kapalı.');
    }

    const listing = await this.prisma.listing.findFirst({
      where: { id: dto.listingId, status: 'ACTIVE', deletedAt: null },
      include: { category: { include: { parent: { select: { slug: true } } } } },
    });
    if (!listing) throw new NotFoundException('İlan bulunamadı veya artık teklif almıyor');
    if (listing.sellerId === buyerId) throw new ForbiddenException('Kendi ilanınıza teklif veremezsiniz');

    if (await this.social.isBlocked(buyerId, listing.sellerId)) {
      throw new ForbiddenException('Bu satıcıyla işlem yapamazsınız');
    }

    const amount = new Decimal(dto.amount);
    if (amount.gte(listing.price)) {
      throw new BadRequestException('Teklifiniz ilan fiyatından düşük olmalı');
    }

    // Aynı ilanda bekleyen teklif varsa yeni teklif açılamaz
    const pending = await this.prisma.offer.findFirst({
      where: { listingId: dto.listingId, buyerId, status: 'PENDING' },
    });
    if (pending) throw new ConflictException('Bu ilanda zaten bekleyen bir teklifiniz var');

    const offer = await this.prisma.offer.create({
      data: {
        listingId: dto.listingId,
        buyerId,
        amount,
        message: dto.message,
        // 48 saat geçerli
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      },
      include: {
        listing: { select: { id: true, title: true, price: true } },
        buyer: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    // Satıcıya bildirim
    const offerBody = `"${listing.title}" ilanınıza ${amount.toFixed(2)} ₺ teklif geldi.`;
    await this.prisma.notification.create({
      data: {
        userId: listing.sellerId,
        type: 'offer.received',
        title: 'Yeni teklif aldınız',
        body: offerBody,
        payload: { offerId: offer.id, listingId: listing.id, listingSlug: buildListingSlug(listing) },
      },
    });
    this.webPush.sendToUser(listing.sellerId, {
      title: 'Yeni teklif aldınız',
      body: offerBody,
      url: `/ilan/${buildListingSlug(listing)}`,
    }, 'offers').catch(() => null);
    this.fcm.sendToUser(listing.sellerId, {
      title: 'Yeni teklif aldınız',
      body: offerBody,
      data: { type: 'offer', offerId: offer.id, listingId: listing.id },
    }, 'offers').catch(() => null);
    this.chatGateway.notifyUser(listing.sellerId, 'offer:updated', { offerId: offer.id, listingId: listing.id, status: 'PENDING' });

    // Mesajlaşmada otomatik bilgi mesajı — teklif anından itibaren alıcı/satıcı arasında
    // her zaman bir konuşma akışı olsun (kabul sonrası manuel "mesaj yaz" zorunluluğu kalkar)
    this.notifyConversation(buyerId, listing.sellerId, listing.id,
      `💰 "${listing.title}" için ${amount.toFixed(2)} ₺ teklif verdi.`).catch(() => null);

    return offer;
  }

  private async notifyConversation(buyerId: string, sellerId: string, listingId: string, text: string) {
    const conv = await this.messages.getOrCreateConversation(buyerId, sellerId, listingId);
    const message = await this.messages.sendMessage(buyerId, conv.id, text);
    this.chatGateway.server.to(`conv:${conv.id}`).emit('message:new', message);
  }

  async respondOffer(offerId: string, sellerId: string, dto: RespondOfferDto) {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: { listing: { include: { category: { include: { parent: { select: { slug: true } } } } } } },
    });
    if (!offer) throw new NotFoundException('Teklif bulunamadı');
    if (offer.listing.sellerId !== sellerId) throw new ForbiddenException();
    if (offer.status !== 'PENDING') {
      throw new BadRequestException(`Bu teklif zaten ${statusTr(offer.status)}`);
    }
    if (offer.expiresAt && offer.expiresAt < new Date()) {
      throw new BadRequestException('Teklifin süresi dolmuş');
    }

    const newStatus = dto.action === 'ACCEPTED' ? 'ACCEPTED' : 'REJECTED';

    const updated = await this.prisma.$transaction(async (tx) => {
      const o = await tx.offer.update({ where: { id: offerId }, data: { status: newStatus } });

      // Kabul edildiyse diğer bekleyen teklifleri reddet
      if (newStatus === 'ACCEPTED') {
        await tx.offer.updateMany({
          where: { listingId: offer.listingId, status: 'PENDING', id: { not: offerId } },
          data: { status: 'REJECTED' },
        });
      }

      return o;
    });

    // Alıcıya bildirim
    const respondTitle = newStatus === 'ACCEPTED' ? 'Teklifiniz kabul edildi!' : 'Teklifiniz reddedildi';
    const respondBody = newStatus === 'ACCEPTED'
      ? `"${offer.listing.title}" için ${offer.amount.toFixed(2)} ₺ teklifiniz kabul edildi.`
      : `"${offer.listing.title}" için teklifiniz reddedildi.`;
    await this.prisma.notification.create({
      data: {
        userId: offer.buyerId,
        type: newStatus === 'ACCEPTED' ? 'offer.accepted' : 'offer.rejected',
        title: respondTitle,
        body: respondBody,
        payload: { offerId, listingId: offer.listingId, listingSlug: buildListingSlug(offer.listing) },
      },
    });
    this.webPush.sendToUser(offer.buyerId, {
      title: respondTitle,
      body: respondBody,
      url: `/ilan/${buildListingSlug(offer.listing)}`,
    }, 'offers').catch(() => null);
    this.fcm.sendToUser(offer.buyerId, {
      title: respondTitle,
      body: respondBody,
      data: { type: 'offer', offerId, listingId: offer.listingId },
    }, 'offers').catch(() => null);
    this.chatGateway.notifyUser(offer.buyerId, 'offer:updated', { offerId, listingId: offer.listingId, status: newStatus });

    return updated;
  }

  async counterOffer(offerId: string, sellerId: string, dto: CounterOfferDto) {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: { listing: { include: { category: { include: { parent: { select: { slug: true } } } } } } },
    });
    if (!offer) throw new NotFoundException('Teklif bulunamadı');
    if (offer.listing.sellerId !== sellerId) throw new ForbiddenException();
    if (offer.status !== 'PENDING') {
      throw new BadRequestException(`Bu teklif zaten ${statusTr(offer.status)}`);
    }

    const counter = new Decimal(dto.counterAmount);
    if (counter.lte(offer.amount)) {
      throw new BadRequestException('Karşı teklif orijinal tekliften yüksek olmalıdır');
    }
    if (counter.gte(offer.listing.price)) {
      throw new BadRequestException('Karşı teklif ilan fiyatından düşük olmalıdır');
    }

    const updated = await this.prisma.offer.update({
      where: { id: offerId },
      data: {
        status: 'COUNTER_OFFERED',
        counterAmount: counter,
        counterMessage: dto.counterMessage,
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      },
    });

    const counterBody = `"${offer.listing.title}" için ${counter.toFixed(2)} ₺ karşı teklif geldi.`;
    await this.prisma.notification.create({
      data: {
        userId: offer.buyerId,
        type: 'offer.countered',
        title: 'Satıcı karşı teklif yaptı',
        body: counterBody,
        payload: { offerId, listingId: offer.listingId, listingSlug: buildListingSlug(offer.listing) },
      },
    });
    this.webPush.sendToUser(offer.buyerId, {
      title: 'Satıcı karşı teklif yaptı',
      body: counterBody,
      url: `/ilan/${buildListingSlug(offer.listing)}`,
    }, 'offers').catch(() => null);
    this.fcm.sendToUser(offer.buyerId, {
      title: 'Satıcı karşı teklif yaptı',
      body: counterBody,
      data: { type: 'offer', offerId, listingId: offer.listingId },
    }, 'offers').catch(() => null);
    this.chatGateway.notifyUser(offer.buyerId, 'offer:updated', { offerId, listingId: offer.listingId, status: 'COUNTER_OFFERED' });

    return updated;
  }

  async respondCounterOffer(offerId: string, buyerId: string, action: 'ACCEPTED' | 'REJECTED') {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: { listing: { include: { category: { include: { parent: { select: { slug: true } } } } } } },
    });
    if (!offer) throw new NotFoundException('Teklif bulunamadı');
    if (offer.buyerId !== buyerId) throw new ForbiddenException();
    if (offer.status !== 'COUNTER_OFFERED') {
      throw new BadRequestException('Yanıtlanacak bir karşı teklif yok');
    }

    const newStatus = action === 'ACCEPTED' ? 'ACCEPTED' : 'REJECTED';

    const updated = await this.prisma.$transaction(async (tx) => {
      const o = await tx.offer.update({ where: { id: offerId }, data: { status: newStatus } });
      if (newStatus === 'ACCEPTED') {
        await tx.offer.updateMany({
          where: { listingId: offer.listingId, status: { in: ['PENDING', 'COUNTER_OFFERED'] }, id: { not: offerId } },
          data: { status: 'REJECTED' },
        });
      }
      return o;
    });

    const counterRespondTitle = newStatus === 'ACCEPTED' ? 'Karşı teklifiniz kabul edildi!' : 'Karşı teklifiniz reddedildi';
    const counterRespondBody = newStatus === 'ACCEPTED'
      ? `"${offer.listing.title}" için ${offer.counterAmount?.toFixed(2)} ₺ karşı teklifiniz kabul edildi.`
      : `"${offer.listing.title}" için karşı teklifiniz reddedildi.`;
    await this.prisma.notification.create({
      data: {
        userId: offer.listing.sellerId,
        type: newStatus === 'ACCEPTED' ? 'offer.counter_accepted' : 'offer.counter_rejected',
        title: counterRespondTitle,
        body: counterRespondBody,
        payload: { offerId, listingId: offer.listingId, listingSlug: buildListingSlug(offer.listing) },
      },
    });
    this.webPush.sendToUser(offer.listing.sellerId, {
      title: counterRespondTitle,
      body: counterRespondBody,
      url: `/ilan/${buildListingSlug(offer.listing)}`,
    }, 'offers').catch(() => null);
    this.fcm.sendToUser(offer.listing.sellerId, {
      title: counterRespondTitle,
      body: counterRespondBody,
      data: { type: 'offer', offerId, listingId: offer.listingId },
    }, 'offers').catch(() => null);
    this.chatGateway.notifyUser(offer.listing.sellerId, 'offer:updated', { offerId, listingId: offer.listingId, status: newStatus });

    return updated;
  }

  async withdrawOffer(offerId: string, buyerId: string) {
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('Teklif bulunamadı');
    if (offer.buyerId !== buyerId) throw new ForbiddenException();
    if (offer.status !== 'PENDING') {
      throw new BadRequestException(`Bu teklif ${statusTr(offer.status)}, geri çekilemez`);
    }

    const updated = await this.prisma.offer.update({ where: { id: offerId }, data: { status: 'WITHDRAWN' } });
    const listing = await this.prisma.listing.findUnique({ where: { id: offer.listingId }, select: { sellerId: true } });
    if (listing) this.chatGateway.notifyUser(listing.sellerId, 'offer:updated', { offerId, listingId: offer.listingId, status: 'WITHDRAWN' });
    return updated;
  }

  async getOffersForListing(listingId: string, sellerId: string) {
    const listing = await this.prisma.listing.findFirst({ where: { id: listingId, deletedAt: null } });
    if (!listing) throw new NotFoundException('İlan bulunamadı');
    if (listing.sellerId !== sellerId) throw new ForbiddenException();

    return this.prisma.offer.findMany({
      where: { listingId },
      orderBy: { createdAt: 'desc' },
      include: {
        buyer: { select: { id: true, displayName: true, avatarUrl: true, ratingAvg: true, salesCount: true } },
      },
    });
  }

  async getMyOffers(buyerId: string) {
    return this.prisma.offer.findMany({
      where: { buyerId },
      orderBy: { createdAt: 'desc' },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            price: true,
            status: true,
            images: { take: 1, orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });
  }

  async getReceivedOffers(sellerId: string) {
    return this.prisma.offer.findMany({
      where: { listing: { sellerId } },
      orderBy: { createdAt: 'desc' },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            price: true,
            status: true,
            images: { take: 1, orderBy: { sortOrder: 'asc' } },
          },
        },
        buyer: { select: { id: true, displayName: true, avatarUrl: true, ratingAvg: true } },
      },
    });
  }
}

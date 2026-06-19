import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SocialService } from '../social/social.service';
import { CreateOfferDto, RespondOfferDto, CounterOfferDto } from './dto/offers.dto';
import { Decimal } from '@prisma/client/runtime/library';
import { buildListingSlug } from '../listings/listings.service';

@Injectable()
export class OffersService {
  constructor(
    private prisma: PrismaService,
    private social: SocialService,
  ) {}

  async createOffer(buyerId: string, dto: CreateOfferDto) {
    const listing = await this.prisma.listing.findFirst({
      where: { id: dto.listingId, status: 'ACTIVE', deletedAt: null },
      include: { category: { include: { parent: { select: { slug: true } } } } },
    });
    if (!listing) throw new NotFoundException('Listing not found or not available');
    if (listing.sellerId === buyerId) throw new ForbiddenException('Cannot offer on your own listing');

    if (await this.social.isBlocked(buyerId, listing.sellerId)) {
      throw new ForbiddenException('Bu satıcıyla işlem yapamazsınız');
    }

    const amount = new Decimal(dto.amount);
    if (amount.gte(listing.price)) {
      throw new BadRequestException('Offer amount must be less than listing price');
    }

    // Aynı ilanda bekleyen teklif varsa yeni teklif açılamaz
    const pending = await this.prisma.offer.findFirst({
      where: { listingId: dto.listingId, buyerId, status: 'PENDING' },
    });
    if (pending) throw new ConflictException('You already have a pending offer on this listing');

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
    await this.prisma.notification.create({
      data: {
        userId: listing.sellerId,
        type: 'offer.received',
        title: 'Yeni teklif aldınız',
        body: `"${listing.title}" ilanınıza ${amount.toFixed(2)} ₺ teklif geldi.`,
        payload: { offerId: offer.id, listingId: listing.id, listingSlug: buildListingSlug(listing) },
      },
    });

    return offer;
  }

  async respondOffer(offerId: string, sellerId: string, dto: RespondOfferDto) {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: { listing: { include: { category: { include: { parent: { select: { slug: true } } } } } } },
    });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.listing.sellerId !== sellerId) throw new ForbiddenException();
    if (offer.status !== 'PENDING') {
      throw new BadRequestException(`Offer is already ${offer.status.toLowerCase()}`);
    }
    if (offer.expiresAt && offer.expiresAt < new Date()) {
      throw new BadRequestException('Offer has expired');
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
    await this.prisma.notification.create({
      data: {
        userId: offer.buyerId,
        type: newStatus === 'ACCEPTED' ? 'offer.accepted' : 'offer.rejected',
        title: newStatus === 'ACCEPTED' ? 'Teklifiniz kabul edildi!' : 'Teklifiniz reddedildi',
        body: newStatus === 'ACCEPTED'
          ? `"${offer.listing.title}" için ${offer.amount.toFixed(2)} ₺ teklifiniz kabul edildi.`
          : `"${offer.listing.title}" için teklifiniz reddedildi.`,
        payload: { offerId, listingId: offer.listingId, listingSlug: buildListingSlug(offer.listing) },
      },
    });

    return updated;
  }

  async counterOffer(offerId: string, sellerId: string, dto: CounterOfferDto) {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: { listing: { include: { category: { include: { parent: { select: { slug: true } } } } } } },
    });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.listing.sellerId !== sellerId) throw new ForbiddenException();
    if (offer.status !== 'PENDING') {
      throw new BadRequestException(`Offer is already ${offer.status.toLowerCase()}`);
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

    await this.prisma.notification.create({
      data: {
        userId: offer.buyerId,
        type: 'offer.countered',
        title: 'Satıcı karşı teklif yaptı',
        body: `"${offer.listing.title}" için ${counter.toFixed(2)} ₺ karşı teklif geldi.`,
        payload: { offerId, listingId: offer.listingId, listingSlug: buildListingSlug(offer.listing) },
      },
    });

    return updated;
  }

  async respondCounterOffer(offerId: string, buyerId: string, action: 'ACCEPTED' | 'REJECTED') {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: { listing: { include: { category: { include: { parent: { select: { slug: true } } } } } } },
    });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.buyerId !== buyerId) throw new ForbiddenException();
    if (offer.status !== 'COUNTER_OFFERED') {
      throw new BadRequestException('No counter offer to respond to');
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

    await this.prisma.notification.create({
      data: {
        userId: offer.listing.sellerId,
        type: newStatus === 'ACCEPTED' ? 'offer.counter_accepted' : 'offer.counter_rejected',
        title: newStatus === 'ACCEPTED' ? 'Karşı teklifiniz kabul edildi!' : 'Karşı teklifiniz reddedildi',
        body: newStatus === 'ACCEPTED'
          ? `"${offer.listing.title}" için ${offer.counterAmount?.toFixed(2)} ₺ karşı teklifiniz kabul edildi.`
          : `"${offer.listing.title}" için karşı teklifiniz reddedildi.`,
        payload: { offerId, listingId: offer.listingId, listingSlug: buildListingSlug(offer.listing) },
      },
    });

    return updated;
  }

  async withdrawOffer(offerId: string, buyerId: string) {
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.buyerId !== buyerId) throw new ForbiddenException();
    if (offer.status !== 'PENDING') {
      throw new BadRequestException(`Cannot withdraw offer with status: ${offer.status}`);
    }

    return this.prisma.offer.update({ where: { id: offerId }, data: { status: 'WITHDRAWN' } });
  }

  async getOffersForListing(listingId: string, sellerId: string) {
    const listing = await this.prisma.listing.findFirst({ where: { id: listingId, deletedAt: null } });
    if (!listing) throw new NotFoundException('Listing not found');
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

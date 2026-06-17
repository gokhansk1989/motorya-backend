import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SocialService } from '../social/social.service';
import { CreateOfferDto, RespondOfferDto } from './dto/offers.dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class OffersService {
  constructor(
    private prisma: PrismaService,
    private social: SocialService,
  ) {}

  async createOffer(buyerId: string, dto: CreateOfferDto) {
    const listing = await this.prisma.listing.findFirst({
      where: { id: dto.listingId, status: 'ACTIVE', deletedAt: null },
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
        payload: { offerId: offer.id, listingId: listing.id },
      },
    });

    return offer;
  }

  async respondOffer(offerId: string, sellerId: string, dto: RespondOfferDto) {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: { listing: true },
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
          ? `"${offer.listing.title}" için ${offer.amount.toFixed(2)} ₺ teklifiniz kabul edildi. Siparişi tamamlayabilirsiniz.`
          : `"${offer.listing.title}" için teklifiniz reddedildi.`,
        payload: { offerId, listingId: offer.listingId },
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

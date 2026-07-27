import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewDirection } from '@prisma/client';
import { CreateReviewDto } from './dto/reviews.dto';

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  async createReview(authorId: string, dto: CreateReviewDto) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: dto.listingId },
      select: { id: true, status: true, sellerId: true, soldToUserId: true },
    });

    if (!listing) throw new NotFoundException('Listing not found');

    const blockedStatuses = ['DRAFT', 'PENDING_REVIEW', 'REJECTED'];
    if (blockedStatuses.includes(listing.status)) {
      throw new BadRequestException('Reviews cannot be left on listings with status: ' + listing.status);
    }

    let direction: ReviewDirection;
    let targetUserId: string;

    /**
     * Yorum hakkı iki yoldan doğar:
     *  1) Kabul edilmiş teklif — resmî pazarlık akışını kullananlar
     *  2) Satıcının "satıldı" işaretlerken alıcı olarak seçtiği kişi —
     *     kullanıcıların çoğu teklif vermeden mesajlaşarak anlaştığı için
     *     bu yol olmadan yorum havuzu pratikte hiç dolmuyordu.
     * Her iki yol da karşı tarafın onayına dayanır, uydurma yorum üretilemez.
     */
    const hasAcceptedOffer = (buyerId: string) =>
      this.prisma.offer.findFirst({
        where: { listingId: dto.listingId, buyerId, status: 'ACCEPTED' },
        select: { id: true },
      });

    if (authorId === listing.sellerId) {
      // Satıcı, alıcıyı değerlendiriyor
      direction = 'SELLER_TO_BUYER';
      const buyerId = dto.buyerId ?? listing.soldToUserId;
      if (!buyerId) {
        throw new BadRequestException('buyerId is required for seller-to-buyer reviews');
      }
      const eligible = listing.soldToUserId === buyerId || (await hasAcceptedOffer(buyerId));
      if (!eligible) {
        throw new BadRequestException('Bu alıcıyla tamamlanmış bir alışverişiniz yok');
      }
      targetUserId = buyerId;
    } else {
      // Alıcı, satıcıyı değerlendiriyor
      direction = 'BUYER_TO_SELLER';
      const eligible = listing.soldToUserId === authorId || (await hasAcceptedOffer(authorId));
      if (!eligible) {
        throw new BadRequestException('Bu ilanda tamamlanmış bir alışverişiniz yok');
      }
      targetUserId = listing.sellerId;
    }

    const existing = await this.prisma.review.findUnique({
      where: { listingId_direction: { listingId: dto.listingId, direction } },
    });
    if (existing) throw new ConflictException('A review already exists for this listing in this direction');

    const review = await this.prisma.review.create({
      data: {
        listingId: dto.listingId,
        authorId,
        targetUserId,
        direction,
        rating: dto.rating,
        comment: dto.comment,
      },
    });

    await this.updateUserRating(targetUserId);

    return review;
  }

  async getReviewsForUser(targetUserId: string, direction?: ReviewDirection) {
    return this.prisma.review.findMany({
      where: { targetUserId, ...(direction ? { direction } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, displayName: true, avatarUrl: true } },
        listing: { select: { id: true, title: true } },
      },
    });
  }

  async getReviewsForListing(listingId: string) {
    return this.prisma.review.findMany({
      where: { listingId },
      include: {
        author: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });
  }

  private async updateUserRating(userId: string) {
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.review.aggregate({
        where: { targetUserId: userId },
        _avg: { rating: true },
        _count: { rating: true },
      });

      await tx.user.update({
        where: { id: userId },
        data: {
          ratingAvg: result._avg.rating ?? 0,
          ratingCount: result._count.rating,
        },
      });
    });
  }
}

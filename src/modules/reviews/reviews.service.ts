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
      select: { id: true, status: true, sellerId: true },
    });

    if (!listing) throw new NotFoundException('Listing not found');

    const blockedStatuses = ['DRAFT', 'PENDING_REVIEW', 'REJECTED'];
    if (blockedStatuses.includes(listing.status)) {
      throw new BadRequestException('Reviews cannot be left on listings with status: ' + listing.status);
    }

    let direction: ReviewDirection;
    let targetUserId: string;

    if (authorId === listing.sellerId) {
      // Seller reviewing the buyer
      direction = 'SELLER_TO_BUYER';
      if (!dto.buyerId) {
        throw new BadRequestException('buyerId is required for seller-to-buyer reviews');
      }
      // Verify buyer has an ACCEPTED offer on this listing
      const offer = await this.prisma.offer.findFirst({
        where: { listingId: dto.listingId, buyerId: dto.buyerId, status: 'ACCEPTED' },
      });
      if (!offer) {
        throw new BadRequestException('Buyer does not have an accepted offer on this listing');
      }
      targetUserId = dto.buyerId;
    } else {
      // Buyer reviewing the seller
      direction = 'BUYER_TO_SELLER';
      // Verify author has an ACCEPTED offer on this listing
      const offer = await this.prisma.offer.findFirst({
        where: { listingId: dto.listingId, buyerId: authorId, status: 'ACCEPTED' },
      });
      if (!offer) {
        throw new BadRequestException('You do not have an accepted offer on this listing');
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

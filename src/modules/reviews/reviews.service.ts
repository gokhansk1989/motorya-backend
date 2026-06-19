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
    if (listing.status !== 'SOLD') {
      throw new BadRequestException('Reviews can only be left on sold listings');
    }

    if (listing.sellerId === authorId) {
      throw new ForbiddenException('Seller cannot review their own listing');
    }

    const direction: ReviewDirection = 'BUYER_TO_SELLER';
    const targetUserId = listing.sellerId;

    const existing = await this.prisma.review.findUnique({
      where: { listingId_direction: { listingId: dto.listingId, direction } },
    });
    if (existing) throw new ConflictException('You already reviewed this listing');

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

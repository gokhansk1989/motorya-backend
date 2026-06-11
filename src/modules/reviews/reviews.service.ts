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
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'COMPLETED') {
      throw new BadRequestException('Reviews can only be left on completed orders');
    }

    const isBuyer = order.buyerId === authorId;
    const isSeller = order.sellerId === authorId;
    if (!isBuyer && !isSeller) throw new ForbiddenException();

    const direction: ReviewDirection = isBuyer ? 'BUYER_TO_SELLER' : 'SELLER_TO_BUYER';
    const targetUserId = isBuyer ? order.sellerId : order.buyerId;

    const existing = await this.prisma.review.findUnique({
      where: { orderId_direction: { orderId: dto.orderId, direction } },
    });
    if (existing) throw new ConflictException('You already reviewed this order');

    const review = await this.prisma.review.create({
      data: {
        orderId: dto.orderId,
        authorId,
        targetUserId,
        direction,
        rating: dto.rating,
        comment: dto.comment,
      },
    });

    // Hedef kullanıcının denormalize itibar alanlarını güncelle
    await this.updateUserRating(targetUserId);

    return review;
  }

  async getReviewsForUser(targetUserId: string, direction?: ReviewDirection) {
    return this.prisma.review.findMany({
      where: { targetUserId, ...(direction ? { direction } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, displayName: true, avatarUrl: true } },
        order: { select: { id: true, listing: { select: { id: true, title: true } } } },
      },
    });
  }

  async getReviewsForOrder(orderId: string, requesterId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== requesterId && order.sellerId !== requesterId) {
      throw new ForbiddenException();
    }

    return this.prisma.review.findMany({
      where: { orderId },
      include: {
        author: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });
  }

  private async updateUserRating(userId: string) {
    const result = await this.prisma.review.aggregate({
      where: { targetUserId: userId },
      _avg: { rating: true },
      _count: { rating: true },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ratingAvg: result._avg.rating ?? 0,
        ratingCount: result._count.rating,
      },
    });
  }
}

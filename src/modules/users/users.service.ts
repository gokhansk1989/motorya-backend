import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { SearchService } from '../search/search.service';
import { SocialService } from '../social/social.service';
import { UpdateProfileDto, ChangePasswordDto } from './dto/users.dto';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private search: SearchService,
    private social: SocialService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
        city: true,
        role: true,
        status: true,
        ratingAvg: true,
        ratingCount: true,
        salesCount: true,
        isFounder: true,
        phoneVerifiedAt: true,
        emailVerifiedAt: true,
        identityVerifiedAt: true,
        vacationMode: true,
        vacationSince: true,
        createdAt: true,
        subscription: {
          select: {
            status: true,
            plan: { select: { name: true, slug: true, featuredCredits: true } },
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async getPublicProfile(userId: string, viewerId?: string) {
    if (viewerId && viewerId !== userId) {
      const blocked = await this.social.isBlocked(viewerId, userId);
      if (blocked) throw new NotFoundException('User not found');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null, status: 'ACTIVE' },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        city: true,
        ratingAvg: true,
        ratingCount: true,
        salesCount: true,
        isFounder: true,
        phoneVerifiedAt: true,
        emailVerifiedAt: true,
        identityVerifiedAt: true,
        createdAt: true,
        listings: {
          where: { deletedAt: null, status: { in: ['ACTIVE', 'SOLD'] } },
          orderBy: { createdAt: 'desc' },
          take: 30,
          include: {
            images: { take: 1, orderBy: { sortOrder: 'asc' } },
            category: { select: { id: true, name: true } },
          },
        },
        reviewsReceived: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            author: { select: { id: true, displayName: true, avatarUrl: true } },
            order: {
              select: {
                listing: {
                  select: {
                    id: true,
                    title: true,
                    images: { take: 1, orderBy: { sortOrder: 'asc' } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const fastResponder = await this.isFastResponder(userId);
    return { ...user, fastResponder };
  }

  // Son 30 konuşmada satıcının alıcıya ortalama yanıt süresi 60 dk altındaysa "Hızlı yanıt verir" rozeti
  private async isFastResponder(userId: string): Promise<boolean> {
    const conversations = await this.prisma.conversation.findMany({
      where: { participants: { some: { userId } } },
      orderBy: { updatedAt: 'desc' },
      take: 30,
      select: {
        messages: {
          orderBy: { createdAt: 'asc' },
          select: { senderId: true, createdAt: true },
        },
      },
    });

    let totalMinutes = 0;
    let sampleCount = 0;
    for (const conv of conversations) {
      const msgs = conv.messages;
      const firstFromOther = msgs.findIndex((m) => m.senderId !== userId);
      if (firstFromOther === -1) continue;
      const reply = msgs.slice(firstFromOther + 1).find((m) => m.senderId === userId);
      if (!reply) continue;
      const minutes = (reply.createdAt.getTime() - msgs[firstFromOther].createdAt.getTime()) / 60_000;
      totalMinutes += minutes;
      sampleCount++;
    }

    if (sampleCount < 3) return false; // yeterli veri yoksa rozet gösterilmez
    return totalMinutes / sampleCount <= 60;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: {
        id: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
        city: true,
      },
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must be different from current password');
    }

    const hash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } });
    return { success: true };
  }

  async getNotifications(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    const itemsWithReadFlag = items.map((n) => ({ ...n, isRead: n.readAt !== null }));
    return { items: itemsWithReadFlag, meta: { total, page, limit, unreadCount } };
  }

  async markNotificationsRead(userId: string, ids?: string[]) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    return { success: true };
  }

  async setVacationMode(userId: string, enabled: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (enabled) {
      // Pause all active listings
      const activeListings = await this.prisma.listing.findMany({
        where: { sellerId: userId, status: 'ACTIVE', deletedAt: null },
        select: { id: true },
      });

      if (activeListings.length > 0) {
        await this.prisma.listing.updateMany({
          where: { sellerId: userId, status: 'ACTIVE', deletedAt: null },
          data: { status: 'ARCHIVED' },
        });

        // Remove from search index
        await Promise.all(activeListings.map((l) => this.search.removeListing(l.id).catch(() => null)));
      }

      await this.prisma.user.update({
        where: { id: userId },
        data: { vacationMode: true, vacationSince: new Date() },
      });

      return { vacationMode: true, pausedCount: activeListings.length };
    } else {
      // Restore archived listings that were paused by vacation mode
      // We restore all ARCHIVED listings since we can't distinguish vacation-paused from manually-paused
      // A better UX: restore only those archived while vacation was active
      const archivedListings = await this.prisma.listing.findMany({
        where: { sellerId: userId, status: 'ARCHIVED', deletedAt: null },
        include: {
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          category: true,
          brand: true,
          seller: { select: { id: true, displayName: true } },
        },
      });

      if (archivedListings.length > 0) {
        await this.prisma.listing.updateMany({
          where: { sellerId: userId, status: 'ARCHIVED', deletedAt: null },
          data: { status: 'ACTIVE' },
        });

        // Re-index in search
        await Promise.all(
          archivedListings.map((l) =>
            this.search
              .indexListing({
                id: l.id,
                title: l.title,
                description: l.description,
                price: Number(l.price),
                originalPrice: l.originalPrice ? Number(l.originalPrice) : undefined,
                condition: l.condition,
                city: l.city ?? undefined,
                sizeLabel: l.sizeLabel ?? undefined,
                categoryId: l.categoryId,
                categoryName: (l.category as any)?.name ?? '',
                brandId: l.brandId ?? undefined,
                brandName: (l.brand as any)?.name ?? undefined,
                sellerId: l.sellerId,
                sellerName: (l.seller as any)?.displayName ?? '',
                imageUrl: (l.images as any)?.[0]?.url ?? undefined,
                status: 'ACTIVE',
                createdAt: new Date(l.createdAt).getTime(),
              })
              .catch(() => null),
          ),
        );
      }

      await this.prisma.user.update({
        where: { id: userId },
        data: { vacationMode: false, vacationSince: null },
      });

      return { vacationMode: false, restoredCount: archivedListings.length };
    }
  }
}

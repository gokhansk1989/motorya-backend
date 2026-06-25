import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { SearchService } from '../search/search.service';
import { SocialService } from '../social/social.service';
import { UpdateProfileDto, ChangePasswordDto } from './dto/users.dto';
import { AuditService } from '../audit/audit.service';

const DEFAULT_NOTIFICATION_PREFS = {
  offers: true,
  messages: true,
  priceDrops: true,
  listingStatus: true,
};

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private search: SearchService,
    private social: SocialService,
    private audit: AuditService,
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
        district: true,
        tcKimlik: true,
        birthDate: true,
        gender: true,
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
        notificationPrefs: true,
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
    const fastResponder = await this.isFastResponder(userId);
    const userWithResponder = {
      ...user,
      fastResponder,
      notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS, ...((user.notificationPrefs as any) ?? {}) },
    };
    const badges = this.getBadges(userWithResponder);
    const trustScore = this.getTrustScore(userWithResponder);
    return { ...userWithResponder, badges, trustScore };
  }

  async updateNotificationPrefs(userId: string, dto: Partial<Record<keyof typeof DEFAULT_NOTIFICATION_PREFS, boolean>>) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { notificationPrefs: true } });
    if (!user) throw new NotFoundException('User not found');
    const merged = { ...DEFAULT_NOTIFICATION_PREFS, ...((user.notificationPrefs as any) ?? {}), ...dto };
    await this.prisma.user.update({ where: { id: userId }, data: { notificationPrefs: merged } });
    return merged;
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
    });
    if (!user) throw new NotFoundException('User not found');

    const fastResponder = await this.isFastResponder(userId);
    const userWithResponder = { ...user, fastResponder };
    const badges = this.getBadges(userWithResponder);
    const trustScore = this.getTrustScore(userWithResponder);
    return { ...userWithResponder, badges, trustScore };
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

  getBadges(user: {
    ratingAvg: number;
    ratingCount: number;
    salesCount: number;
    isFounder: boolean;
    emailVerifiedAt: Date | null;
    phoneVerifiedAt: Date | null;
    identityVerifiedAt: Date | null;
    fastResponder: boolean;
  }) {
    const badges: { key: string; label: string; icon: string; tier: 'gold' | 'silver' | 'blue' }[] = [];

    if (user.identityVerifiedAt) badges.push({ key: 'identity_verified', label: 'Kimlik Doğrulandı', icon: '🪪', tier: 'gold' });
    if (user.ratingAvg >= 4.5 && user.ratingCount >= 5) badges.push({ key: 'trusted_seller', label: 'Güvenilir Satıcı', icon: '⭐', tier: 'gold' });
    if (user.salesCount >= 10) badges.push({ key: 'top_seller', label: 'Çok Satan', icon: '🏆', tier: 'gold' });
    if (user.isFounder) badges.push({ key: 'founder', label: 'Kurucu Üye', icon: '🚀', tier: 'gold' });
    if (user.fastResponder) badges.push({ key: 'fast_responder', label: 'Hızlı Yanıt', icon: '⚡', tier: 'silver' });
    if (user.phoneVerifiedAt) badges.push({ key: 'phone_verified', label: 'Telefon Doğrulandı', icon: '📱', tier: 'silver' });
    if (user.emailVerifiedAt) badges.push({ key: 'email_verified', label: 'E-posta Doğrulandı', icon: '✉️', tier: 'blue' });

    return badges;
  }

  getTrustScore(user: {
    ratingAvg: number;
    ratingCount: number;
    salesCount: number;
    isFounder: boolean;
    emailVerifiedAt: Date | null;
    phoneVerifiedAt: Date | null;
    identityVerifiedAt: Date | null;
    fastResponder: boolean;
  }): number {
    let score = 0;

    // Doğrulama (max 40 puan)
    if (user.emailVerifiedAt) score += 10;
    if (user.phoneVerifiedAt) score += 15;
    if (user.identityVerifiedAt) score += 15;

    // Satış başarısı (max 30 puan)
    score += Math.min(user.salesCount * 2, 20);
    if (user.salesCount >= 10) score += 10;

    // Puanlama (max 20 puan)
    if (user.ratingCount >= 1) score += Math.round(user.ratingAvg * 2); // max 10
    if (user.ratingCount >= 5) score += 5;
    if (user.ratingCount >= 10) score += 5;

    // Davranış (max 10 puan)
    if (user.fastResponder) score += 5;
    if (user.isFounder) score += 5;

    return Math.min(score, 100);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    if (dto.tcKimlik) {
      const existing = await this.prisma.user.findFirst({ where: { tcKimlik: dto.tcKimlik, id: { not: userId } } });
      if (existing) throw new ConflictException('Bu TC Kimlik numarası başka bir hesapla ilişkili');
    }

    const { birthDate, ...rest } = dto;
    return this.prisma.user.update({
      where: { id: userId },
      data: { ...rest, ...(birthDate !== undefined ? { birthDate: birthDate ? new Date(birthDate) : null } : {}) },
      select: {
        id: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
        city: true,
        district: true,
        tcKimlik: true,
        birthDate: true,
        gender: true,
      },
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto, ip?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must be different from current password');
    }

    const hash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } });
    this.audit.log({ actorId: userId, action: 'user.password_change', entity: 'User', entityId: userId, ip, userAgent });
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

import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WebPushService } from '../users/webpush.service';
import { MailService } from '../mail/mail.service';
import { buildListingSlug } from '../listings/listings.service';
import { CreateSavedSearchDto } from './dto/saved-search.dto';

const MAX_SAVED_SEARCHES_PER_USER = 20;

@Injectable()
export class SavedSearchService {
  constructor(
    private prisma: PrismaService,
    private webPush: WebPushService,
    private mail: MailService,
  ) {}

  async create(userId: string, dto: CreateSavedSearchDto) {
    const count = await this.prisma.savedSearch.count({ where: { userId } });
    if (count >= MAX_SAVED_SEARCHES_PER_USER) {
      throw new ForbiddenException(`En fazla ${MAX_SAVED_SEARCHES_PER_USER} kayıtlı arama tutabilirsin`);
    }

    return this.prisma.savedSearch.create({
      data: { userId, ...dto },
    });
  }

  async getMine(userId: string) {
    return this.prisma.savedSearch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async remove(userId: string, id: string) {
    const saved = await this.prisma.savedSearch.findUnique({ where: { id } });
    if (!saved) throw new NotFoundException('Saved search not found');
    if (saved.userId !== userId) throw new ForbiddenException();
    await this.prisma.savedSearch.delete({ where: { id } });
    return { success: true };
  }

  // Yeni ilan onaylandığında eşleşen kayıtlı aramaları bildir.
  async notifyMatching(listing: {
    id: string;
    title: string;
    price: number;
    categoryId: string;
    brandId?: string | null;
    city?: string | null;
    condition: string;
    category?: { slug: string; parentId?: string | null; parent?: { slug: string } | null } | null;
  }) {
    const candidates = await this.prisma.savedSearch.findMany({
      where: { OR: [{ categoryId: listing.categoryId }, { categoryId: null }] },
    });

    const titleLower = listing.title.toLowerCase();
    const matches = candidates.filter((s) => {
      if (s.categoryId && s.categoryId !== listing.categoryId) return false;
      if (s.brandId && s.brandId !== listing.brandId) return false;
      if (s.city && s.city !== listing.city) return false;
      if (s.condition && s.condition !== listing.condition) return false;
      if (s.minPrice && listing.price < Number(s.minPrice)) return false;
      if (s.maxPrice && listing.price > Number(s.maxPrice)) return false;
      if (s.search && !titleLower.includes(s.search.toLowerCase())) return false;
      return true;
    });

    if (matches.length === 0) return;

    await this.prisma.notification.createMany({
      data: matches.map((s) => ({
        userId: s.userId,
        type: 'saved_search.match',
        title: '🔍 Aradığın ilan yayınlandı',
        body: `"${s.label}" aramana uyan yeni bir ilan var: ${listing.title}`,
        payload: { listingId: listing.id, savedSearchId: s.id },
      })),
    });

    await this.prisma.savedSearch.updateMany({
      where: { id: { in: matches.map((s) => s.id) } },
      data: { lastNotifiedAt: new Date() },
    });

    const listingSlug = buildListingSlug(listing);
    this.webPush.sendToMany(
      matches.map((s) => s.userId),
      { title: 'Aradığın ilan yayınlandı', body: listing.title, url: `/ilan/${listingSlug}` },
    ).catch(() => null);

    const userIds = [...new Set(matches.map((s) => s.userId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, displayName: true },
    });

    for (const user of users) {
      const userMatches = matches.filter((s) => s.userId === user.id);
      const label = userMatches.map((s) => s.label).join(', ');
      this.mail.sendSavedSearchMatchEmail(user.email, user.displayName, label, listing.title, listingSlug).catch(() => null);
    }
  }
}

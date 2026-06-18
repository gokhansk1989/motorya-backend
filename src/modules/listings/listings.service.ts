import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListingStatus } from '@prisma/client';
import { CreateListingDto, UpdateListingDto, ListingsQueryDto } from './dto/listings.dto';
import { SearchService, ListingDocument } from '../search/search.service';
import { SocialService } from '../social/social.service';
import { MailService } from '../mail/mail.service';
import { WebPushService } from '../users/webpush.service';

// Türkçe karakterleri latinize edip URL-safe slug üretir
function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

// /ilan/{l1}-{l2}-{title}-{city}-{id} formatında slug üretir.
// category.parentId varsa l2, parent ise l1; yoksa sadece l1 kullanılır.
export function buildListingSlug(listing: {
  id: string;
  title: string;
  city?: string | null;
  category?: { slug: string; parentId?: string | null; parent?: { slug: string } | null } | null;
}): string {
  const parts: string[] = [];
  if (listing.category) {
    if (listing.category.parentId && listing.category.parent) {
      parts.push(listing.category.parent.slug);
      parts.push(listing.category.slug);
    } else {
      parts.push(listing.category.slug);
    }
  }
  parts.push(toSlug(listing.title));
  if (listing.city) parts.push(toSlug(listing.city));
  parts.push(listing.id);
  return parts.join('-');
}

@Injectable()
export class ListingsService {
  constructor(
    private prisma: PrismaService,
    private search: SearchService,
    private social: SocialService,
    private mail: MailService,
    private webPush: WebPushService,
  ) {}

  private toSearchDoc(listing: any): ListingDocument {
    return {
      id: listing.id,
      title: listing.title,
      description: listing.description,
      price: Number(listing.price),
      originalPrice: listing.originalPrice ? Number(listing.originalPrice) : undefined,
      condition: listing.condition,
      city: listing.city ?? undefined,
      sizeLabel: listing.sizeLabel ?? undefined,
      categoryId: listing.categoryId,
      categoryName: listing.category?.name ?? '',
      brandId: listing.brandId ?? undefined,
      brandName: listing.brand?.name ?? undefined,
      sellerId: listing.sellerId,
      sellerName: listing.seller?.displayName ?? '',
      imageUrl: listing.images?.[0]?.url ?? undefined,
      slug: buildListingSlug(listing),
      status: listing.status,
      createdAt: new Date(listing.createdAt).getTime(),
    };
  }

  async getCategories() {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
  }

  async getCategoryBySlug(slug: string) {
    const category = await this.prisma.category.findUnique({ where: { slug } });
    if (!category) return null;
    const children = await this.prisma.category.findMany({ where: { parentId: category.id }, orderBy: { sortOrder: 'asc' } });
    const grandchildren = children.length > 0
      ? await this.prisma.category.findMany({ where: { parentId: { in: children.map(c => c.id) } }, orderBy: { sortOrder: 'asc' } })
      : [];
    return { category, children, grandchildren };
  }

  private async resolveCategoryIds(categoryId?: string, categorySlug?: string): Promise<string[] | null> {
    if (!categoryId && !categorySlug) return null;
    let rootId = categoryId;
    if (!rootId && categorySlug) {
      const cat = await this.prisma.category.findUnique({ where: { slug: categorySlug } });
      if (!cat) return [];
      rootId = cat.id;
    }
    // collect rootId + all descendant IDs
    const ids = [rootId!];
    const children = await this.prisma.category.findMany({ where: { parentId: rootId } });
    for (const child of children) {
      ids.push(child.id);
      const grandchildren = await this.prisma.category.findMany({ where: { parentId: child.id } });
      grandchildren.forEach(gc => ids.push(gc.id));
    }
    return ids;
  }

  async getBrands() {
    return this.prisma.brand.findMany({ orderBy: { name: 'asc' } });
  }

  async adminCreateCategory(data: { name: string; slug: string; parentId?: string; sortOrder?: number }) {
    return this.prisma.category.create({ data: { ...data, isActive: true } });
  }

  async adminUpdateCategory(id: string, data: { name?: string; slug?: string; parentId?: string; sortOrder?: number; isActive?: boolean }) {
    return this.prisma.category.update({ where: { id }, data });
  }

  async adminDeleteCategory(id: string) {
    await this.prisma.category.delete({ where: { id } });
  }

  async adminCreateBrand(data: { name: string; slug: string; logoUrl?: string }) {
    return this.prisma.brand.create({ data });
  }

  async adminUpdateBrand(id: string, data: { name?: string; slug?: string; logoUrl?: string }) {
    return this.prisma.brand.update({ where: { id }, data });
  }

  async adminDeleteBrand(id: string) {
    await this.prisma.brand.delete({ where: { id } });
  }

  async createListing(sellerId: string, dto: CreateListingDto) {
    const { imageUrls = [], ...rest } = dto;

    const listing = await this.prisma.listing.create({
      data: {
        ...rest,
        brandId: rest.brandId || null,
        city: rest.city || null,
        sizeLabel: rest.sizeLabel || null,
        price: rest.price,
        originalPrice: rest.originalPrice ?? null,
        sellerId,
        status: 'PENDING_REVIEW',
        images: {
          create: imageUrls.map((url, i) => ({ url, sortOrder: i })),
        },
      },
      include: { images: true, category: { include: { parent: { select: { slug: true } } } }, brand: true, seller: { select: { email: true, displayName: true } } },
    });

    // Satıcıya bildirim + mail
    await this.prisma.notification.create({
      data: {
        userId: sellerId,
        type: 'listing.pending',
        title: 'İlanın incelemeye alındı',
        body: `"${listing.title}" ilanın ekibimiz tarafından inceleniyor. Onaylandığında sana haber vereceğiz.`,
        payload: { listingId: listing.id },
      },
    });
    this.mail.sendListingPendingEmail(
      (listing.seller as any).email,
      (listing.seller as any).displayName,
      listing.title,
    ).catch(() => null);

    return { ...listing, slug: buildListingSlug(listing) };
  }

  async getListings(query: ListingsQueryDto, viewerId?: string) {
    const {
      search,
      categoryId,
      categorySlug,
      brandId,
      condition,
      city,
      minPrice,
      maxPrice,
      page = 1,
      limit = 20,
      sort = 'newest',
    } = query;

    const where: any = {
      status: ListingStatus.ACTIVE,
      deletedAt: null,
    };

    if (viewerId) {
      const blockedIds = await this.social.getBlockedUserIds(viewerId).catch(() => []);
      if (blockedIds.length > 0) where.sellerId = { notIn: blockedIds };
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    const categoryIds = await this.resolveCategoryIds(categoryId, categorySlug);
    if (categoryIds !== null) {
      where.categoryId = categoryIds.length === 1 ? categoryIds[0] : { in: categoryIds };
    }
    if (brandId) where.brandId = brandId;
    if (condition) where.condition = condition;
    if ((query as any).gender) where.gender = (query as any).gender;
    if (city) where.city = { contains: city, mode: 'insensitive' };
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      if (minPrice !== undefined) where.price.gte = minPrice;
      if (maxPrice !== undefined) where.price.lte = maxPrice;
    }

    const orderBy = {
      price_asc: { price: 'asc' as const },
      price_desc: { price: 'desc' as const },
      newest: { createdAt: 'desc' as const },
      oldest: { createdAt: 'asc' as const },
    }[sort];

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          seller: { select: { id: true, displayName: true, avatarUrl: true, ratingAvg: true } },
          category: { select: { id: true, name: true, slug: true, parentId: true, parent: { select: { slug: true } } } },
          brand: { select: { id: true, name: true } },
        },
      }),
      this.prisma.listing.count({ where }),
    ]);

    let favoritedIds = new Set<string>();
    if (viewerId) {
      const favs = await this.prisma.favorite.findMany({
        where: { userId: viewerId, listingId: { in: items.map(i => i.id) } },
        select: { listingId: true },
      });
      favoritedIds = new Set(favs.map(f => f.listingId));
    }

    return {
      items: items.map(item => ({ ...item, slug: buildListingSlug(item), isFavorited: favoritedIds.has(item.id) })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // Slug'dan ID'yi çıkarır: son CUID veya tüm olası son segmentleri dener.
  async getListingBySlug(slug: string, viewerId?: string) {
    // CUID: c + 24 alfanumerik karakter (tire yok)
    const cuidMatch = slug.match(/c[a-z0-9]{24}$/);
    if (cuidMatch) {
      return this.getListingById(cuidMatch[0], viewerId);
    }

    // Non-CUID ID: slug'un sonundaki kısımlar olabilir (örn. "listing-e2").
    // Giderek uzayan suffix deneriz — ilk bulunan ACTIVE ilan kazanır.
    const parts = slug.split('-');
    for (let take = 1; take <= Math.min(parts.length, 4); take++) {
      const candidateId = parts.slice(-take).join('-');
      const found = await this.prisma.listing.findFirst({
        where: { id: candidateId, deletedAt: null },
        select: { id: true },
      });
      if (found) return this.getListingById(found.id, viewerId);
    }

    throw new NotFoundException('Listing not found');
  }

  async getListingById(id: string, viewerId?: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id, deletedAt: null },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        seller: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            city: true,
            ratingAvg: true,
            ratingCount: true,
            salesCount: true,
            createdAt: true,
          },
        },
        category: { include: { parent: { select: { slug: true } } } },
        brand: true,
      },
    });

    if (!listing) throw new NotFoundException('Listing not found');

    if (listing.status !== ListingStatus.ACTIVE && listing.sellerId !== viewerId) {
      throw new NotFoundException('Listing not found');
    }

    // Fire-and-forget view count increment
    this.prisma.listing
      .update({ where: { id }, data: { viewCount: { increment: 1 } } })
      .catch(() => null);

    let isFavorited = false;
    if (viewerId) {
      const fav = await this.prisma.favorite.findUnique({
        where: { userId_listingId: { userId: viewerId, listingId: id } },
      });
      isFavorited = !!fav;
    }

    return { ...listing, slug: buildListingSlug(listing), isFavorited };
  }

  async getListingsByIds(ids: string[]) {
    if (ids.length === 0) return [];
    const listings = await this.prisma.listing.findMany({
      where: { id: { in: ids }, status: 'ACTIVE', deletedAt: null },
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        seller: { select: { id: true, displayName: true } },
        brand: true,
      },
    });
    const byId = new Map(listings.map((l) => [l.id, l]));
    return ids.map((id) => byId.get(id)).filter((l): l is NonNullable<typeof l> => !!l);
  }

  async getSimilarListings(id: string) {
    const listing = await this.prisma.listing.findFirst({ where: { id, deletedAt: null } });
    if (!listing) throw new NotFoundException('Listing not found');

    const include = {
      images: { orderBy: { sortOrder: 'asc' as const }, take: 1 },
      seller: { select: { id: true, displayName: true } },
      brand: true,
    };
    const limit = 8;
    const results: any[] = [];
    const seen = new Set<string>([id]);

    const tiers = [
      listing.brandId ? { categoryId: listing.categoryId, brandId: listing.brandId } : null,
      listing.city ? { categoryId: listing.categoryId, city: listing.city } : null,
      { categoryId: listing.categoryId },
    ].filter((w): w is NonNullable<typeof w> => !!w);

    for (const filter of tiers) {
      if (results.length >= limit) break;
      const batch = await this.prisma.listing.findMany({
        where: { ...filter, status: 'ACTIVE', deletedAt: null, id: { notIn: [...seen] } },
        orderBy: { createdAt: 'desc' },
        take: limit - results.length,
        include,
      });
      for (const item of batch) {
        seen.add(item.id);
        results.push(item);
      }
    }

    return results;
  }

  async updateListing(id: string, sellerId: string, dto: UpdateListingDto) {
    const listing = await this.prisma.listing.findFirst({ where: { id, deletedAt: null } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.sellerId !== sellerId) throw new ForbiddenException();
    if (['SOLD', 'REJECTED'].includes(listing.status)) {
      throw new BadRequestException('Cannot edit listing with status: ' + listing.status);
    }

    const { imageUrls, ...rest } = dto;

    return this.prisma.$transaction(async (tx) => {
      if (imageUrls !== undefined) {
        await tx.listingImage.deleteMany({ where: { listingId: id } });
        await tx.listingImage.createMany({
          data: imageUrls.map((url, i) => ({ listingId: id, url, sortOrder: i })),
        });
      }

      // ARCHIVED → düzenlenince tekrar moderasyona gönder; ACTIVE → yeniden moderasyon
      const newStatus = ['ACTIVE', 'ARCHIVED'].includes(listing.status) ? 'PENDING_REVIEW' : listing.status;

      const updated = await tx.listing.update({
        where: { id },
        data: {
          ...rest,
          brandId: rest.brandId === '' ? null : rest.brandId,
          city: rest.city === '' ? null : rest.city,
          sizeLabel: rest.sizeLabel === '' ? null : rest.sizeLabel,
          status: newStatus as any,
        },
        include: { images: { orderBy: { sortOrder: 'asc' } }, category: true, brand: true, seller: true },
      });

      if (listing.status === 'ACTIVE') {
        this.search.removeListing(id).catch(() => null);
      }

      // Fiyat düştüyse favorileyen kullanıcılara bildirim
      if (rest.price !== undefined && Number(rest.price) < Number(listing.price)) {
        this.notifyFavorites(id, listing.title, 'price_drop', {
          oldPrice: Number(listing.price),
          newPrice: Number(rest.price),
        }).catch(() => null);
      }

      return updated;
    });
  }

  async toggleListingStatus(id: string, sellerId: string) {
    const listing = await this.prisma.listing.findFirst({ where: { id, deletedAt: null } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.sellerId !== sellerId) throw new ForbiddenException();

    if (!['ACTIVE', 'ARCHIVED'].includes(listing.status)) {
      throw new BadRequestException('Yalnızca aktif veya arşivlenmiş ilanlar değiştirilebilir');
    }

    const newStatus = listing.status === 'ACTIVE' ? ListingStatus.ARCHIVED : ListingStatus.ACTIVE;

    const updated = await this.prisma.listing.update({
      where: { id },
      data: { status: newStatus },
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        category: true,
        brand: true,
        seller: { select: { id: true, displayName: true } },
      },
    });

    if (newStatus === ListingStatus.ACTIVE) {
      this.search.indexListing(this.toSearchDoc(updated)).catch(() => null);
    } else {
      this.search.removeListing(id).catch(() => null);
    }

    return updated;
  }

  async deleteListing(id: string, sellerId: string) {
    const listing = await this.prisma.listing.findFirst({ where: { id, deletedAt: null } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.sellerId !== sellerId) throw new ForbiddenException();
    if (['PAID_ESCROW', 'SHIPPED', 'DELIVERED'].includes(listing.status as string)) {
      throw new BadRequestException('Cannot delete listing with an active order');
    }

    await this.prisma.listing.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'ARCHIVED' },
    });

    this.search.removeListing(id).catch(() => null);

    return { success: true };
  }

  async getMyListings(sellerId: string, status?: ListingStatus) {
    return this.prisma.listing.findMany({
      where: { sellerId, deletedAt: null, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        category: { select: { id: true, name: true } },
      },
    });
  }

  async toggleFavorite(userId: string, listingId: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, status: ListingStatus.ACTIVE, deletedAt: null },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    const existing = await this.prisma.favorite.findUnique({
      where: { userId_listingId: { userId, listingId } },
    });

    if (existing) {
      await this.prisma.$transaction([
        this.prisma.favorite.delete({ where: { userId_listingId: { userId, listingId } } }),
        this.prisma.listing.update({ where: { id: listingId }, data: { favoriteCount: { decrement: 1 } } }),
      ]);
      return { favorited: false };
    }

    await this.prisma.$transaction([
      this.prisma.favorite.create({ data: { userId, listingId } }),
      this.prisma.listing.update({ where: { id: listingId }, data: { favoriteCount: { increment: 1 } } }),
    ]);
    return { favorited: true };
  }

  async getMyFavorites(userId: string) {
    const favorites = await this.prisma.favorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        listing: {
          include: {
            images: { orderBy: { sortOrder: 'asc' }, take: 1 },
            seller: { select: { id: true, displayName: true, avatarUrl: true } },
            category: { select: { id: true, name: true } },
          },
        },
      },
    });

    return favorites.map((f) => f.listing);
  }

  // Admin/moderatör tarafından çağrılır
  async changeStatus(id: string, status: ListingStatus) {
    const listing = await this.prisma.listing.findFirst({
      where: { id, deletedAt: null },
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        category: true,
        brand: true,
        seller: { select: { id: true, displayName: true } },
      },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    const updated = await this.prisma.listing.update({
      where: { id },
      data: {
        status,
        publishedAt: status === ListingStatus.ACTIVE && !listing.publishedAt ? new Date() : listing.publishedAt,
      },
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        category: true,
        brand: true,
        seller: { select: { id: true, displayName: true } },
      },
    });

    if (status === ListingStatus.ACTIVE) {
      this.search.indexListing(this.toSearchDoc(updated)).catch(() => null);
    } else {
      this.search.removeListing(id).catch(() => null);
    }

    if (status === ListingStatus.SOLD) {
      this.notifyFavorites(id, listing.title, 'listing_sold', {}).catch(() => null);
    }

    return updated;
  }

  private async notifyFavorites(
    listingId: string,
    listingTitle: string,
    type: 'price_drop' | 'listing_sold',
    meta: Record<string, any>,
  ) {
    const favorites = await this.prisma.favorite.findMany({
      where: { listingId },
      select: { userId: true },
    });
    if (favorites.length === 0) return;

    const notifications = favorites.map(f => ({
      userId: f.userId,
      type: `favorite.${type}`,
      title: type === 'price_drop'
        ? '💰 Fiyat düştü!'
        : '🔴 Favori ilan satıldı',
      body: type === 'price_drop'
        ? `"${listingTitle}" ilanında fiyat ${meta.oldPrice.toFixed(0)} ₺ → ${meta.newPrice.toFixed(0)} ₺ oldu.`
        : `"${listingTitle}" ilanı satılmış. Benzer ilanları keşfet!`,
      payload: { listingId, ...meta },
    }));

    await this.prisma.notification.createMany({ data: notifications });

    // Web Push — aynı kullanıcılara push bildirimi
    const userIds = favorites.map(f => f.userId);
    const pushPayload = type === 'price_drop'
      ? { title: 'Fiyat düştü!', body: `"${listingTitle}" ${meta.oldPrice.toFixed(0)} ₺ → ${meta.newPrice.toFixed(0)} ₺`, url: `/ilan/${listingId}` }
      : { title: 'Favori ilan satıldı', body: `"${listingTitle}" artık mevcut değil.`, url: '/' };
    this.webPush.sendToMany(userIds, pushPayload).catch(() => null);
  }

  async reindexAll() {
    const listings = await this.prisma.listing.findMany({
      where: { status: ListingStatus.ACTIVE, deletedAt: null },
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        category: true,
        brand: true,
        seller: { select: { id: true, displayName: true } },
      },
    });

    await this.search.reindexAll(listings.map((l) => this.toSearchDoc(l)));
    return { indexed: listings.length };
  }

  async reportListing(reporterId: string, listingId: string, reason: string, description?: string) {
    const listing = await this.prisma.listing.findFirst({ where: { id: listingId, deletedAt: null } });
    if (!listing) throw new NotFoundException('Listing not found');

    const existing = await this.prisma.report.findFirst({
      where: { reporterId, listingId, status: { in: ['OPEN', 'REVIEWED'] } },
    });
    if (existing) return { alreadyReported: true };

    const report = await this.prisma.report.create({
      data: {
        reporterId,
        targetType: 'LISTING',
        listingId,
        reason: description ? `${reason}: ${description}` : reason,
        status: 'OPEN',
      },
    });
    return { id: report.id, alreadyReported: false };
  }
}

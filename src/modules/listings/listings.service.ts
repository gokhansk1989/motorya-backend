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

@Injectable()
export class ListingsService {
  constructor(
    private prisma: PrismaService,
    private search: SearchService,
  ) {}

  private toSearchDoc(listing: any): ListingDocument {
    return {
      id: listing.id,
      title: listing.title,
      description: listing.description,
      price: listing.price,
      originalPrice: listing.originalPrice ?? undefined,
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
      status: listing.status,
      createdAt: new Date(listing.createdAt).getTime(),
    };
  }

  async getCategories() {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
  }

  async getBrands() {
    return this.prisma.brand.findMany({ orderBy: { name: 'asc' } });
  }

  async createListing(sellerId: string, dto: CreateListingDto) {
    const { imageUrls = [], ...rest } = dto;

    return this.prisma.listing.create({
      data: {
        ...rest,
        price: rest.price,
        originalPrice: rest.originalPrice ?? null,
        sellerId,
        status: 'PENDING_REVIEW',
        images: {
          create: imageUrls.map((url, i) => ({ url, sortOrder: i })),
        },
      },
      include: { images: true, category: true, brand: true },
    });
  }

  async getListings(query: ListingsQueryDto) {
    const {
      search,
      categoryId,
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

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (categoryId) where.categoryId = categoryId;
    if (brandId) where.brandId = brandId;
    if (condition) where.condition = condition;
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
          category: { select: { id: true, name: true, slug: true } },
          brand: { select: { id: true, name: true } },
        },
      }),
      this.prisma.listing.count({ where }),
    ]);

    return {
      items,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
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
        category: true,
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

    return { ...listing, isFavorited };
  }

  async updateListing(id: string, sellerId: string, dto: UpdateListingDto) {
    const listing = await this.prisma.listing.findFirst({ where: { id, deletedAt: null } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.sellerId !== sellerId) throw new ForbiddenException();
    if (['SOLD', 'ARCHIVED', 'REJECTED'].includes(listing.status)) {
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

      return tx.listing.update({
        where: { id },
        data: {
          ...rest,
          // Active ilan güncellendi → yeniden moderasyona gönder
          status: listing.status === 'ACTIVE' ? 'PENDING_REVIEW' : listing.status,
        },
        include: { images: { orderBy: { sortOrder: 'asc' } }, category: true, brand: true },
      });
    });
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

    return updated;
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
}

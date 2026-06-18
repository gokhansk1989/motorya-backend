import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ModerateListingDto, ModerateUserDto } from './dto/admin.dto';
import { MailService } from '../mail/mail.service';
import { SearchService } from '../search/search.service';
import { SavedSearchService } from '../saved-search/saved-search.service';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private search: SearchService,
    private savedSearch: SavedSearchService,
  ) {}

  async getMetrics() {
    const [
      totalUsers,
      activeListings,
      pendingListings,
      totalOrders,
      openDisputes,
      revenueResult,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.listing.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      this.prisma.listing.count({ where: { status: 'PENDING_REVIEW', deletedAt: null } }),
      this.prisma.order.count(),
      this.prisma.dispute.count({ where: { status: 'OPEN' } }),
      this.prisma.order.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { commissionAmount: true },
      }),
    ]);

    return {
      totalUsers,
      activeListings,
      pendingListings,
      totalOrders,
      openDisputes,
      totalRevenue: revenueResult._sum.commissionAmount ?? 0,
    };
  }

  async getNotificationSummary() {
    const [pendingListings, openReports, openDisputes] = await Promise.all([
      this.prisma.listing.count({ where: { status: 'PENDING_REVIEW', deletedAt: null } }),
      this.prisma.report.count({ where: { status: 'OPEN' } }),
      this.prisma.dispute.count({ where: { status: 'OPEN' } }),
    ]);

    return {
      pendingListings,
      openReports,
      openDisputes,
      total: pendingListings + openReports + openDisputes,
    };
  }

  async getPendingListings(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.listing.findMany({
        where: { status: 'PENDING_REVIEW', deletedAt: null },
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
        include: {
          images: { take: 1, orderBy: { sortOrder: 'asc' } },
          seller: { select: { id: true, displayName: true, email: true } },
          category: { select: { id: true, name: true } },
        },
      }),
      this.prisma.listing.count({ where: { status: 'PENDING_REVIEW', deletedAt: null } }),
    ]);

    return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async moderateListing(id: string, adminId: string, dto: ModerateListingDto) {
    const listing = await this.prisma.listing.findFirst({
      where: { id, deletedAt: null },
      include: { seller: { select: { id: true, email: true, displayName: true } } },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    const [updated] = await this.prisma.$transaction([
      this.prisma.listing.update({
        where: { id },
        data: {
          status: dto.action,
          publishedAt: dto.action === 'ACTIVE' ? new Date() : listing.publishedAt,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: adminId,
          action: dto.action === 'ACTIVE' ? 'listing.approve' : 'listing.reject',
          entity: 'Listing',
          entityId: id,
          meta: { note: dto.note },
        },
      }),
    ]);

    if (dto.action === 'ACTIVE') {
      this.mail.sendListingApprovedEmail(listing.seller.email, listing.seller.displayName, listing.title, id).catch(() => null);
      this.prisma.notification.create({
        data: {
          userId: listing.seller.id,
          type: 'listing.approved',
          title: 'İlanın yayında! 🎉',
          body: `"${listing.title}" ilanın onaylandı ve yayına alındı.`,
          payload: { listingId: id },
        },
      }).catch(() => null);
      // Index in search after approval
      const full = await this.prisma.listing.findFirst({
        where: { id },
        include: {
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          category: { include: { parent: { select: { slug: true } } } },
          brand: true,
          seller: { select: { id: true, displayName: true } },
        },
      });
      if (full) {
        this.search.indexListing({
          id: full.id,
          title: full.title,
          description: full.description,
          price: Number(full.price),
          originalPrice: full.originalPrice ? Number(full.originalPrice) : undefined,
          condition: full.condition,
          city: full.city ?? undefined,
          sizeLabel: full.sizeLabel ?? undefined,
          categoryId: full.categoryId,
          categoryName: (full.category as any)?.name ?? '',
          brandId: full.brandId ?? undefined,
          brandName: (full.brand as any)?.name ?? undefined,
          sellerId: full.sellerId,
          sellerName: (full.seller as any)?.displayName ?? '',
          imageUrl: (full.images as any)?.[0]?.url ?? undefined,
          status: 'ACTIVE',
          createdAt: new Date(full.createdAt).getTime(),
        }).catch(() => null);

        this.savedSearch.notifyMatching({
          id: full.id,
          title: full.title,
          price: Number(full.price),
          categoryId: full.categoryId,
          brandId: full.brandId,
          city: full.city,
          condition: full.condition,
          category: full.category as any,
        }).catch(() => null);
      }
    } else if (dto.action === 'REJECTED') {
      this.mail.sendListingRejectedEmail(listing.seller.email, listing.seller.displayName, listing.title, dto.note).catch(() => null);
      this.search.removeListing(id).catch(() => null);
      this.prisma.notification.create({
        data: {
          userId: listing.seller.id,
          type: 'listing.rejected',
          title: 'İlanın onaylanmadı',
          body: dto.note
            ? `"${listing.title}" ilanın reddedildi. Sebep: ${dto.note}`
            : `"${listing.title}" ilanın reddedildi. Düzenleyip tekrar gönderebilirsin.`,
          payload: { listingId: id },
        },
      }).catch(() => null);
    } else if (dto.action === 'ARCHIVED') {
      this.search.removeListing(id).catch(() => null);
    }

    return updated;
  }

  async deleteListing(id: string, adminId: string) {
    const listing = await this.prisma.listing.findFirst({ where: { id, deletedAt: null } });
    if (!listing) throw new NotFoundException('Listing not found');

    await this.prisma.$transaction([
      this.prisma.listing.update({ where: { id }, data: { deletedAt: new Date(), status: 'ARCHIVED' } }),
      this.prisma.auditLog.create({
        data: { actorId: adminId, action: 'listing.delete', entity: 'Listing', entityId: id, meta: {} },
      }),
    ]);

    this.search.removeListing(id).catch(() => null);
    return { success: true };
  }

  async getAllListings(page = 1, limit = 20, status?: string, search?: string) {
    const skip = (page - 1) * limit;
    const where: any = { deletedAt: null };
    if (status) where.status = status;
    if (search) where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { seller: { displayName: { contains: search, mode: 'insensitive' } } },
    ];

    const [items, total] = await Promise.all([
      this.prisma.listing.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          seller: { select: { id: true, displayName: true, email: true } },
          category: { select: { id: true, name: true } },
        },
      }),
      this.prisma.listing.count({ where }),
    ]);

    return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async changeUserRole(id: string, adminId: string, role: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { role: role as any } }),
      this.prisma.auditLog.create({
        data: {
          actorId: adminId,
          action: 'user.role_change',
          entity: 'User',
          entityId: id,
          meta: { oldRole: user.role, newRole: role },
        },
      }),
    ]);

    // Yeni admin/moderatör ise hoş geldiniz maili gönder
    const adminRoles = ['ADMIN', 'SUPER_ADMIN', 'MODERATOR'];
    if (adminRoles.includes(role) && !adminRoles.includes(user.role)) {
      const adminUrl = process.env.ADMIN_URL ?? 'https://admin.motorya.com.tr';
      this.mail.sendAdminWelcomeEmail(user.email, user.displayName, role, adminUrl).catch(() => null);
    }

    return updated;
  }

  async moderateUser(id: string, adminId: string, dto: ModerateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { status: dto.status } }),
      this.prisma.auditLog.create({
        data: {
          actorId: adminId,
          action: `user.${dto.status.toLowerCase()}`,
          entity: 'User',
          entityId: id,
          meta: { note: dto.note },
        },
      }),
    ]);

    return updated;
  }

  async getAuditLog(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          actor: { select: { id: true, displayName: true, email: true } },
        },
      }),
      this.prisma.auditLog.count(),
    ]);

    return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getUsers(page = 1, limit = 20, search?: string) {
    const where: any = { deletedAt: null };
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          status: true,
          ratingAvg: true,
          ratingCount: true,
          salesCount: true,
          createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    // Sosyal istatistikler: ayrı sorgular (tablolar henüz Prisma client'ta olmayabilir, graceful fallback)
    const enriched = await Promise.all(items.map(async u => {
      try {
        const [followerCount, blockedByCount, listingCount, favoriteCount] = await Promise.all([
          (this.prisma as any).userFollow?.count({ where: { followingId: u.id } }) ?? 0,
          (this.prisma as any).userBlock?.count({ where: { blockedId: u.id } }) ?? 0,
          this.prisma.listing.count({ where: { sellerId: u.id, deletedAt: null } }),
          this.prisma.favorite.count({ where: { userId: u.id } }),
        ]);
        return { ...u, followerCount, blockedByCount, listingCount, favoriteCount };
      } catch {
        return { ...u, followerCount: 0, blockedByCount: 0, listingCount: 0, favoriteCount: 0 };
      }
    }));

    return { items: enriched, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // Reports
  async getReports(page = 1, limit = 20, status?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          reporter: { select: { id: true, displayName: true, email: true } },
          listing: {
            select: {
              id: true, title: true, status: true,
              images: { take: 1, orderBy: { sortOrder: 'asc' } },
              seller: { select: { id: true, displayName: true } },
            },
          },
        },
      }),
      this.prisma.report.count({ where }),
    ]);

    return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async updateReportStatus(id: string, adminId: string, status: string, note?: string) {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('Report not found');

    const updated = await this.prisma.report.update({
      where: { id },
      data: { status: status as any, reviewedAt: new Date() },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: `report.${status.toLowerCase()}`,
        entity: 'Report',
        entityId: id,
        meta: { note },
      },
    });

    return updated;
  }
}

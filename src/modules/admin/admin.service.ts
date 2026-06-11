import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ModerateListingDto, ModerateUserDto } from './dto/admin.dto';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

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
    const listing = await this.prisma.listing.findFirst({ where: { id, deletedAt: null } });
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
          salesCount: true,
          createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}

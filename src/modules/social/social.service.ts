import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SocialService {
  constructor(private prisma: PrismaService) {}

  async toggleFollow(followerId: string, followingId: string) {
    if (followerId === followingId) throw new ForbiddenException('Kendinizi takip edemezsiniz');

    const target = await this.prisma.user.findUnique({ where: { id: followingId } });
    if (!target) throw new NotFoundException('Kullanıcı bulunamadı');

    const existing = await this.prisma.userFollow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });

    if (existing) {
      await this.prisma.userFollow.delete({ where: { id: existing.id } });
      return { following: false };
    }

    await this.prisma.userFollow.create({ data: { followerId, followingId } });
    return { following: true };
  }

  async toggleBlock(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) throw new ForbiddenException('Kendinizi engelleyemezsiniz');

    const target = await this.prisma.user.findUnique({ where: { id: blockedId } });
    if (!target) throw new NotFoundException('Kullanıcı bulunamadı');

    const existing = await this.prisma.userBlock.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId } },
    });

    if (existing) {
      await this.prisma.userBlock.delete({ where: { id: existing.id } });
      return { blocked: false };
    }

    // Engelleme → varsa takip ilişkilerini de kaldır
    await this.prisma.$transaction([
      this.prisma.userBlock.create({ data: { blockerId, blockedId } }),
      this.prisma.userFollow.deleteMany({
        where: {
          OR: [
            { followerId: blockerId, followingId: blockedId },
            { followerId: blockedId, followingId: blockerId },
          ],
        },
      }),
    ]);

    return { blocked: true };
  }

  async getRelationStatus(viewerId: string, targetId: string) {
    const [following, blocked, followedBy, blockedBy] = await Promise.all([
      this.prisma.userFollow.findUnique({ where: { followerId_followingId: { followerId: viewerId, followingId: targetId } } }),
      this.prisma.userBlock.findUnique({ where: { blockerId_blockedId: { blockerId: viewerId, blockedId: targetId } } }),
      this.prisma.userFollow.findUnique({ where: { followerId_followingId: { followerId: targetId, followingId: viewerId } } }),
      this.prisma.userBlock.findUnique({ where: { blockerId_blockedId: { blockerId: targetId, blockedId: viewerId } } }),
    ]);
    return {
      isFollowing: !!following,
      isBlocked: !!blocked,
      isFollowedBy: !!followedBy,
      isBlockedBy: !!blockedBy,
    };
  }

  async isBlocked(userA: string, userB: string): Promise<boolean> {
    const block = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: userA, blockedId: userB },
          { blockerId: userB, blockedId: userA },
        ],
      },
    });
    return !!block;
  }

  async getFollowing(userId: string) {
    const rows = await this.prisma.userFollow.findMany({
      where: { followerId: userId },
      orderBy: { createdAt: 'desc' },
      include: { following: { select: { id: true, displayName: true, avatarUrl: true, city: true, ratingAvg: true } } },
    });
    return rows.map(r => r.following);
  }

  async getBlocked(userId: string) {
    const rows = await this.prisma.userBlock.findMany({
      where: { blockerId: userId },
      orderBy: { createdAt: 'desc' },
      include: { blocked: { select: { id: true, displayName: true, avatarUrl: true } } },
    });
    return rows.map(r => r.blocked);
  }
}

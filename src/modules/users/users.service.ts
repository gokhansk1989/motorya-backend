import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  // TODO: getProfile, updateProfile, verifyPhone, verifyEmail, verifyIdentity
  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
        city: true,
        ratingAvg: true,
        ratingCount: true,
        salesCount: true,
        createdAt: true,
      },
    });
  }
}

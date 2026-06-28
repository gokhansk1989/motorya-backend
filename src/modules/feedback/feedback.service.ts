import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FeedbackService {
  constructor(private prisma: PrismaService) {}

  async create(input: { message: string; page?: string; contactEmail?: string; userId?: string | null }) {
    return this.prisma.userFeedback.create({
      data: {
        message: input.message.slice(0, 2000),
        page: input.page?.slice(0, 500) ?? null,
        contactEmail: input.contactEmail?.slice(0, 200) ?? null,
        userId: input.userId ?? null,
      },
    });
  }

  async findMany(params: { status?: string; page: number; limit: number }) {
    const { status, page, limit } = params;
    const where: any = {};
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.userFeedback.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.userFeedback.count({ where }),
    ]);

    return { items, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async getSummary() {
    const newCount = await this.prisma.userFeedback.count({ where: { status: 'NEW' } });
    const total = await this.prisma.userFeedback.count();
    return { newCount, total };
  }

  async updateStatus(id: string, status: string) {
    return this.prisma.userFeedback.update({ where: { id }, data: { status } });
  }
}

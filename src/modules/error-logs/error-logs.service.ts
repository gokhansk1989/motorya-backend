import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface LogErrorInput {
  source: string;
  message: string;
  stack?: string | null;
  path?: string | null;
  method?: string | null;
  statusCode?: number | null;
  userId?: string | null;
  context?: Record<string, unknown> | null;
}

@Injectable()
export class ErrorLogsService {
  constructor(private prisma: PrismaService) {}

  // Loglama hiçbir zaman asıl isteği bozmamalı — her zaman fire-and-forget çağrılır.
  async log(input: LogErrorInput) {
    try {
      await this.prisma.errorLog.create({
        data: {
          source: input.source,
          message: input.message.slice(0, 2000),
          stack: input.stack?.slice(0, 8000) ?? null,
          path: input.path?.slice(0, 500) ?? null,
          method: input.method ?? null,
          statusCode: input.statusCode ?? null,
          userId: input.userId ?? null,
          context: (input.context as any) ?? undefined,
        },
      });
    } catch {
      // Loglama altyapısı çökse bile uygulama akışı etkilenmemeli.
    }
  }

  async findMany(params: { source?: string; q?: string; page: number; limit: number }) {
    const { source, q, page, limit } = params;
    const where: any = {};
    if (source) where.source = source;
    if (q) where.message = { contains: q, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      this.prisma.errorLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.errorLog.count({ where }),
    ]);

    return { items, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async getSummary() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [last24h, total] = await Promise.all([
      this.prisma.errorLog.count({ where: { createdAt: { gte: since } } }),
      this.prisma.errorLog.count(),
    ]);
    return { last24h, total };
  }

  async clearAll() {
    const { count } = await this.prisma.errorLog.deleteMany({});
    return { deleted: count };
  }
}

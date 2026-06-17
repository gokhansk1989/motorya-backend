import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

@Injectable()
export class BlogService {
  constructor(private prisma: PrismaService) {}

  async listPublic(page = 1, limit = 20, category?: string) {
    const where: any = { published: true };
    if (category) where.category = category;
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.blogPost.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true, slug: true, title: true, excerpt: true,
          category: true, tags: true, coverEmoji: true, coverImage: true,
          author: true, readTime: true, publishedAt: true, createdAt: true,
        },
      }),
      this.prisma.blogPost.count({ where }),
    ]);
    return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getBySlug(slug: string) {
    const post = await this.prisma.blogPost.findFirst({
      where: { slug, published: true },
    });
    if (!post) throw new NotFoundException('Blog yazısı bulunamadı');
    return post;
  }

  // Admin methods
  async adminList(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.blogPost.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.blogPost.count(),
    ]);
    return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async adminGet(id: string) {
    const post = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Blog yazısı bulunamadı');
    return post;
  }

  async create(dto: any) {
    const slug = dto.slug || slugify(dto.title);
    const existing = await this.prisma.blogPost.findUnique({ where: { slug } });
    if (existing) throw new ConflictException('Bu slug zaten kullanımda');
    return this.prisma.blogPost.create({
      data: {
        ...dto,
        slug,
        publishedAt: dto.published ? (dto.publishedAt ?? new Date()) : null,
      },
    });
  }

  async update(id: string, dto: any) {
    const post = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Blog yazısı bulunamadı');

    if (dto.slug && dto.slug !== post.slug) {
      const existing = await this.prisma.blogPost.findUnique({ where: { slug: dto.slug } });
      if (existing) throw new ConflictException('Bu slug zaten kullanımda');
    }

    const data: any = { ...dto };
    if (dto.published && !post.publishedAt && !dto.publishedAt) {
      data.publishedAt = new Date();
    }
    if (dto.published === false) {
      data.publishedAt = null;
    }

    return this.prisma.blogPost.update({ where: { id }, data });
  }

  async remove(id: string) {
    const post = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Blog yazısı bulunamadı');
    await this.prisma.blogPost.delete({ where: { id } });
    return { success: true };
  }
}

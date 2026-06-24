import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStaticPageDto, UpdateStaticPageDto } from './dto/pages.dto';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

@Injectable()
export class PagesService {
  constructor(private prisma: PrismaService) {}

  async getBySlug(slug: string) {
    const page = await this.prisma.staticPage.findUnique({ where: { slug } });
    if (!page || !page.published) throw new NotFoundException('Sayfa bulunamadı');
    return page;
  }

  async adminList() {
    const items = await this.prisma.staticPage.findMany({ orderBy: { createdAt: 'asc' } });
    return { items, meta: { total: items.length } };
  }

  async adminGet(id: string) {
    const page = await this.prisma.staticPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException('Sayfa bulunamadı');
    return page;
  }

  async create(dto: CreateStaticPageDto) {
    const slug = dto.slug || slugify(dto.title);
    const existing = await this.prisma.staticPage.findUnique({ where: { slug } });
    if (existing) throw new ConflictException('Bu slug zaten kullanımda');
    return this.prisma.staticPage.create({ data: { ...dto, slug } });
  }

  async update(id: string, dto: UpdateStaticPageDto) {
    await this.adminGet(id);
    if (dto.slug) {
      const existing = await this.prisma.staticPage.findUnique({ where: { slug: dto.slug } });
      if (existing && existing.id !== id) throw new ConflictException('Bu slug zaten kullanımda');
    }
    return this.prisma.staticPage.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.adminGet(id);
    await this.prisma.staticPage.delete({ where: { id } });
    return { success: true };
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Yalnızca backend'de gerçekten okunan flag'ler burada tanımlı — dekoratif ayar eklenmemeli.
const DEFAULTS: Record<string, boolean> = {
  maintenance_mode: false,
  new_registrations: true,
  new_listings: true,
  offer_system: true,
};

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async getAll() {
    const rows = await this.prisma.systemSetting.findMany();
    const map: Record<string, any> = { ...DEFAULTS };
    for (const r of rows) map[r.key] = r.value;
    return map;
  }

  async get(key: string): Promise<boolean> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    if (!row) return DEFAULTS[key] ?? true;
    return row.value as any;
  }

  async setMany(values: Record<string, boolean>) {
    const keys = Object.keys(values).filter((k) => k in DEFAULTS);
    await Promise.all(
      keys.map((key) =>
        this.prisma.systemSetting.upsert({
          where: { key },
          create: { key, value: values[key] },
          update: { value: values[key] },
        }),
      ),
    );
    return this.getAll();
  }
}

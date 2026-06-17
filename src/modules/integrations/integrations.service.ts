import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULTS = [
  { key: 'sendgrid', name: 'SendGrid', config: { api_key: '', from_email: 'noreply@motorya.com.tr' } },
  { key: 'paytr', name: 'PayTR', config: { merchant_id: '', merchant_key: '', merchant_salt: '' } },
  { key: 'iyzico', name: 'iyzico', config: { api_key: '', secret_key: '', base_url: 'https://sandbox-api.iyzipay.com' } },
  { key: 'netgsm', name: 'NetGSM', config: { username: '', password: '', sender: 'MOTORYA' } },
  { key: 'fcm', name: 'Firebase FCM', config: { server_key: '', project_id: '' } },
  { key: 's3', name: 'AWS S3', config: { access_key: '', secret_key: '', bucket: '', region: 'eu-central-1' } },
];

const SENSITIVE = ['api_key', 'secret_key', 'merchant_key', 'merchant_salt', 'password', 'server_key'];

@Injectable()
export class IntegrationsService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    for (const d of DEFAULTS) {
      await this.prisma.integration.upsert({
        where: { key: d.key },
        update: {},
        create: { key: d.key, name: d.name, config: d.config, enabled: false },
      });
    }
  }

  async list() {
    const rows = await this.prisma.integration.findMany({ orderBy: { key: 'asc' } });
    return rows.map(r => ({ ...r, config: this.mask(r.config as Record<string, string>) }));
  }

  async get(key: string) {
    return this.prisma.integration.findUnique({ where: { key } });
  }

  async update(key: string, config: Record<string, string>, enabled: boolean) {
    const existing = await this.prisma.integration.findUnique({ where: { key } });
    if (!existing) return;

    const current = existing.config as Record<string, string>;
    const merged: Record<string, string> = { ...current };
    for (const [k, v] of Object.entries(config)) {
      if (v && v !== '••••••••') merged[k] = v;
    }

    const isEnabled = enabled ?? this.isConfigured(merged, key);
    return this.prisma.integration.update({
      where: { key },
      data: { config: merged, enabled: isEnabled },
    });
  }

  async getConfig(key: string): Promise<Record<string, string>> {
    const row = await this.prisma.integration.findUnique({ where: { key } });
    return (row?.config as Record<string, string>) ?? {};
  }

  private mask(config: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(config)) {
      out[k] = SENSITIVE.includes(k) && v ? '••••••••' : v;
    }
    return out;
  }

  private isConfigured(config: Record<string, string>, key: string): boolean {
    const required: Record<string, string[]> = {
      sendgrid: ['api_key', 'from_email'],
      paytr: ['merchant_id', 'merchant_key', 'merchant_salt'],
      iyzico: ['api_key', 'secret_key'],
      netgsm: ['username', 'password'],
      fcm: ['server_key', 'project_id'],
      s3: ['access_key', 'secret_key', 'bucket'],
    };
    return (required[key] ?? []).every(f => !!config[f]);
  }
}

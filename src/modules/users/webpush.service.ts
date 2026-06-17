import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);
  private readonly enabled: boolean;
  private webpush: any = null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.webpush = require('web-push');
    } catch {
      this.logger.warn('web-push module not found — push notifications disabled');
      this.enabled = false;
      return;
    }

    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const email = this.config.get<string>('VAPID_EMAIL', 'mailto:admin@motorya.com.tr');

    if (publicKey && privateKey) {
      this.webpush.setVapidDetails(email, publicKey, privateKey);
      this.enabled = true;
    } else {
      this.logger.warn('VAPID keys not set — web push disabled');
      this.enabled = false;
    }
  }

  async subscribe(userId: string, sub: { endpoint: string; p256dh: string; auth: string }) {
    return this.prisma.webPushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: { userId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      update: { userId },
    });
  }

  async unsubscribe(endpoint: string) {
    await this.prisma.webPushSubscription.deleteMany({ where: { endpoint } });
  }

  async sendToUser(userId: string, payload: { title: string; body?: string; url?: string; icon?: string }) {
    if (!this.enabled) return;

    const subs = await this.prisma.webPushSubscription.findMany({ where: { userId } });
    const data = JSON.stringify({ ...payload, icon: payload.icon ?? '/icon-192.png' });

    await Promise.allSettled(
      subs.map(async (s) => {
        try {
          await this.webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, data);
        } catch (err: any) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await this.prisma.webPushSubscription.deleteMany({ where: { endpoint: s.endpoint } });
          }
        }
      }),
    );
  }

  async sendToMany(userIds: string[], payload: { title: string; body?: string; url?: string }) {
    if (!this.enabled || userIds.length === 0) return;
    await Promise.allSettled(userIds.map((id) => this.sendToUser(id, payload)));
  }

  getPublicKey() {
    return this.config.get<string>('VAPID_PUBLIC_KEY') ?? null;
  }
}

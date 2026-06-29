import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type { NotificationCategory } from './webpush.service';

const DEFAULT_PREFS: Record<NotificationCategory, boolean> = {
  offers: true,
  messages: true,
  priceDrops: true,
  listingStatus: true,
};

@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);
  private enabled = false;
  private messaging: any = null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    const raw = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');
    if (!raw) {
      this.logger.warn('FIREBASE_SERVICE_ACCOUNT_JSON not set — native push (FCM) disabled');
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const admin = require('firebase-admin');
      const serviceAccount = JSON.parse(
        raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'),
      );
      const appName = 'motorya-fcm';
      const app = admin.apps.find((a: any) => a?.name === appName)
        ?? admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }, appName);
      this.messaging = admin.messaging(app);
      this.enabled = true;
    } catch (err: any) {
      this.logger.error(`Failed to init firebase-admin: ${err.message}`);
    }
  }

  async registerToken(userId: string, token: string, platform: 'IOS' | 'ANDROID', deviceId?: string) {
    return this.prisma.pushToken.upsert({
      where: { token },
      create: { userId, token, platform, deviceId },
      update: { userId, platform, deviceId, disabledAt: null },
    });
  }

  async unregisterToken(token: string) {
    await this.prisma.pushToken.updateMany({ where: { token }, data: { disabledAt: new Date() } });
  }

  async sendToUser(
    userId: string,
    payload: { title: string; body?: string; data?: Record<string, string> },
    category?: NotificationCategory,
  ) {
    if (!this.enabled) return;

    if (category) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { notificationPrefs: true } });
      const prefs = { ...DEFAULT_PREFS, ...((user?.notificationPrefs as any) ?? {}) };
      if (prefs[category] === false) return;
    }

    const tokens = await this.prisma.pushToken.findMany({
      where: { userId, disabledAt: null, platform: { in: ['IOS', 'ANDROID'] } },
      select: { token: true },
    });
    if (tokens.length === 0) return;

    try {
      const res = await this.messaging.sendEachForMulticast({
        tokens: tokens.map((t) => t.token),
        notification: { title: payload.title, body: payload.body },
        data: payload.data ?? {},
      });

      const invalid: string[] = [];
      res.responses.forEach((r: any, i: number) => {
        if (!r.success && ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(r.error?.code)) {
          invalid.push(tokens[i].token);
        }
      });
      if (invalid.length > 0) {
        await this.prisma.pushToken.updateMany({ where: { token: { in: invalid } }, data: { disabledAt: new Date() } });
      }
    } catch (err: any) {
      this.logger.error(`FCM send failed for user ${userId}: ${err.message}`);
    }
  }

  async sendToMany(
    userIds: string[],
    payload: { title: string; body?: string; data?: Record<string, string> },
    category?: NotificationCategory,
  ) {
    if (!this.enabled || userIds.length === 0) return;
    await Promise.allSettled(userIds.map((id) => this.sendToUser(id, payload, category)));
  }
}

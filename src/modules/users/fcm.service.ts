import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type { NotificationCategory } from './webpush.service';

const DEFAULT_PREFS: Record<NotificationCategory, boolean> = {
  offers: true,
  messages: true,
  priceDrops: true,
  listingStatus: true,
  follows: true,
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
      /**
       * MODULER API (firebase-admin v13+).
       *
       * Burada uzun sure v11/v12 soz dizimi duruyordu:
       *
       *   admin.apps.find(...)                  -> admin.apps UNDEFINED
       *   admin.credential.cert(serviceAccount) -> admin.credential UNDEFINED
       *
       * Her ikisi de v13'te kaldirildi, bu projede ise firebase-admin
       * ILK GUNDEN BERI ^14. Yani kurucu her acilista
       * "Cannot read properties of undefined (reading 'find')" ile
       * patliyor, `enabled` false kaliyor ve sendToUser/sendToMany
       * sessizce hicbir sey yapmiyordu: native push altyapisi eklendigi
       * gunden beri hic calismadi. Hata yalnizca acilis logunda
       * goruldugu icin de farkedilmedi.
       *
       * Modul alt yollari (`firebase-admin/app`, `firebase-admin/messaging`)
       * v14'te desteklenen giris noktalari.
       */
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getApps, initializeApp, cert } = require('firebase-admin/app');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getMessaging } = require('firebase-admin/messaging');

      const serviceAccount = JSON.parse(
        raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'),
      );

      // Adlandirilmis uygulama: varsayilan ornegi baska bir yer
      // kullanirsa catismasin. Sicak yeniden yuklemede ikinci kez
      // initializeApp cagrilirsa hata verir, o yuzden once arıyoruz.
      const appName = 'motorya-fcm';
      const app =
        getApps().find((a: any) => a?.name === appName) ??
        initializeApp({ credential: cert(serviceAccount) }, appName);

      this.messaging = getMessaging(app);
      this.enabled = true;
      this.logger.log('Firebase (FCM) hazir — native push etkin');
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

      /**
       * DIKKAT: sendEachForMulticast basarisizlikta HATA FIRLATMIYOR;
       * her jetonun sonucunu `res.responses` icinde donduruyor. Asagidaki
       * try/catch yalnizca ag/istek seviyesindeki hatalari yakaliyor.
       *
       * Bu yuzden kimlik bilgisi sorunu (app/invalid-credential) gibi
       * TUM gonderimleri olduren bir arıza hicbir iz birakmiyordu: her
       * jeton basarisiz donuyor, hicbiri "kayitli degil" listesinde
       * olmadigi icin de bir sey yapilmiyor ve log sessiz kaliyordu.
       * Artik jetonla ilgili olmayan basarisizliklar ayrica loglaniyor.
       */
      const invalid: string[] = [];
      const JETON_HATALARI = [
        'messaging/registration-token-not-registered',
        'messaging/invalid-registration-token',
      ];
      const digerHatalar = new Set<string>();

      res.responses.forEach((r: any, i: number) => {
        if (r.success) return;
        const kod = r.error?.code;
        if (JETON_HATALARI.includes(kod)) invalid.push(tokens[i].token);
        else digerHatalar.add(kod ?? 'bilinmeyen');
      });

      if (invalid.length > 0) {
        await this.prisma.pushToken.updateMany({ where: { token: { in: invalid } }, data: { disabledAt: new Date() } });
      }
      if (digerHatalar.size > 0) {
        this.logger.error(
          `FCM gonderimi basarisiz (${res.failureCount}/${tokens.length} jeton) — kodlar: ${[...digerHatalar].join(', ')}`,
        );
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

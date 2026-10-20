import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { OlayDto } from './dto/olay.dto';
import { olayTanimli, propsTemizle, OLAYLAR } from './olay-sozlugu';

/**
 * Bilinen otomasyon trafigi. Cihaz parmak izi cikarmiyoruz; yalnizca
 * kullanici ajaninin kendini tanittigi hali bakiyoruz. UA hicbir yere
 * yazilmiyor, sadece bu karsilastirma icin okunuyor.
 */
const BOT_DESENI =
  /bot|crawl|spider|slurp|bingpreview|headlesschrome|puppeteer|playwright|phantomjs|curl\/|wget\/|python-requests|axios\/|go-http-client|semrush|ahrefs|mj12|dataforseo|lighthouse|gtmetrix|pingdom|uptimerobot/i;

/** Raporda haric tutulacak roller. Olay aninda damgalaniyor. */
const PERSONEL_ROLLERI = new Set(['ADMIN', 'SUPER_ADMIN', 'MODERATOR']);

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  /**
   * Ortamdan gelen test hesabi listesi. Personel rolu olmayan ama yalnizca
   * deneme icin kullanilan hesaplari raporda ayirmak icin.
   * ANALYTICS_HARIC_KULLANICILAR=cuid1,cuid2
   */
  private readonly haricKullanicilar: Set<string>;

  constructor(private prisma: PrismaService) {
    this.haricKullanicilar = new Set(
      (process.env.ANALYTICS_HARIC_KULLANICILAR ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }

  /**
   * Olaylari kaydeder. Hicbir kosulda hata firlatmaz.
   *
   * Olcumun bozulmasi ilan vermeyi, aramayi ya da mesajlasmayi durdurmamali.
   * Istemci de zaten yaniti beklemiyor; burada bir sey patlarsa log'a dusuyor
   * ve kullanici bunu hic gormuyor.
   */
  /**
   * SUNUCU TARAFI OLAY.
   *
   * Istemciden gelen "basardim" iddiasina guvenmeden, gercekten olmus
   * bir seyi kaydetmek icin. Hesap olusturma, mail gonderimi ve e-posta
   * dogrulama bu yolu kullaniyor: ucu de veritabani gercegi.
   *
   * `isStaff` burada da sunucuda hesaplaniyor - cagiran taraf rol ya da
   * test isareti GONDERMIYOR, kullanici kimliginden okunuyor.
   *
   * ASLA HATA FIRLATMAZ. Olcumun bozulmasi kayit olmayi ya da e-posta
   * dogrulamayi engellememeli; cagiran taraf await etse bile basarisizlik
   * sessizce yutuluyor.
   */
  async sunucuOlayi(
    name: string,
    opts: {
      /** Olayi tekil kilan anahtar. Ayni anahtar iki kez yazilmaz. */
      benzersizAnahtar: string;
      flowId?: string | null;
      userId?: string | null;
      props?: Record<string, unknown>;
    },
  ): Promise<void> {
    try {
      if (!olayTanimli(name)) {
        this.logger.warn(`Tanimsiz sunucu olayi: ${name}`);
        return;
      }

      // isStaff SUNUCUDA, kullanici kaydindan. Cagiran taraf soyleyemez.
      let isStaff = false;
      if (opts.userId) {
        const u = await this.prisma.user
          .findUnique({ where: { id: opts.userId }, select: { role: true, isTestAccount: true } })
          .catch(() => null);
        isStaff =
          (!!u?.role && PERSONEL_ROLLERI.has(u.role)) ||
          !!u?.isTestAccount ||
          this.haricKullanicilar.has(opts.userId);
      }

      // eventId bicimi istemci olaylariyla ayni dogrulamadan geciyor:
      // [A-Za-z0-9-]{8,64}. Anahtari sabit bir onek + hash ile uretiyoruz
      // ki hesap kimligi gibi degerler dogrudan alana yazilmasin.
      const eventId = `s-${createHash('sha256').update(`${name}:${opts.benzersizAnahtar}`).digest('hex').slice(0, 40)}`;

      await this.prisma.analyticsEvent.createMany({
        data: [{
          eventId,
          name,
          flowId: opts.flowId ?? null,
          userId: opts.userId ?? null,
          isStaff,
          props: propsTemizle(name as keyof typeof OLAYLAR, opts.props ?? {}) as object,
        }],
        skipDuplicates: true,
      });
    } catch (err: any) {
      this.logger.warn(`Sunucu olayi yazilamadi (${name}): ${err?.message}`);
    }
  }

  async kaydet(
    olaylar: OlayDto[],
    baglam: {
      userId?: string | null;
      role?: string | null;
      isTestAccount?: boolean | null;
      userAgent?: string | null;
    },
  ): Promise<{ alinan: number }> {
    try {
      if (BOT_DESENI.test(baglam.userAgent ?? '')) return { alinan: 0 };

      const userId = baglam.userId ?? null;
      // isStaff "normal donusum raporuna girmesin" demek. Uc kaynak:
      // personel rolu, acikca isaretlenmis test hesabi ve ortamdaki
      // haric listesi. Damga olay aninda vuruluyor; hesap sonradan test
      // isaretini kaybederse gecmis sayilar kaymiyor.
      const isStaff =
        (!!baglam.role && PERSONEL_ROLLERI.has(baglam.role)) ||
        !!baglam.isTestAccount ||
        (!!userId && this.haricKullanicilar.has(userId));

      const satirlar = olaylar
        .filter((o) => olayTanimli(o.name))
        .filter((o) => {
          // Akis kimligi zorunlu olan olay onsuz gelirse ilan huni
          // hesaplarini bozar; saymamak sapmali saymaktan iyi.
          const tanim = OLAYLAR[o.name as keyof typeof OLAYLAR];
          return !('akisGerekli' in tanim && tanim.akisGerekli) || !!o.flowId;
        })
        .map((o) => ({
          eventId: o.eventId,
          name: o.name,
          flowId: o.flowId ?? null,
          userId,
          isStaff,
          props: propsTemizle(o.name as keyof typeof OLAYLAR, o.props) as object,
        }));

      if (!satirlar.length) return { alinan: 0 };

      // skipDuplicates + eventId unique: ag hatasinda tekrar gonderilen olay
      // bir kez sayiliyor. Sunucu tarafinda tekilleme, istemciye guvenmekten
      // daha saglam.
      const sonuc = await this.prisma.analyticsEvent.createMany({
        data: satirlar,
        skipDuplicates: true,
      });
      return { alinan: sonuc.count };
    } catch (e) {
      this.logger.warn(`Olay kaydedilemedi: ${(e as Error).message}`);
      return { alinan: 0 };
    }
  }

  /**
   * Saklama suresi: 180 gun. Huni oranlari icin 30-90 gunluk pencere
   * yetiyor; daha eskisi karar uretmiyor ama veri birikmeye devam ediyor.
   * Hesap silinince olaylari iliskiyle birlikte zaten siliniyor.
   */
  async eskileriSil(gun = 180): Promise<number> {
    const sinir = new Date(Date.now() - gun * 24 * 60 * 60 * 1000);
    try {
      const { count } = await this.prisma.analyticsEvent.deleteMany({
        where: { occurredAt: { lt: sinir } },
      });
      if (count) this.logger.log(`${count} eski analitik olayi silindi (>${gun} gun)`);
      return count;
    } catch (e) {
      this.logger.warn(`Eski olaylar silinemedi: ${(e as Error).message}`);
      return 0;
    }
  }
}

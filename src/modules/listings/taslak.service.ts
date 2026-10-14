import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { gorselleriDogrula } from './gorsel-dogrula';
import { taslagiTemizle, TASLAK_EN_FAZLA_FOTO } from './taslak-alanlari';

/**
 * Yarim kalan ilan taslagi.
 *
 * Kullanici basina en fazla bir taslak. Taslak satiri Listing DEGIL:
 * ilan sayilarina, moderasyon kuyruguna, bildirimlere ve "ilanlarim"
 * listesine girmiyor, dolayisiyla hicbir yerde yayinlanmis ilan ya da
 * tamamlanmis donusum olarak sayilmiyor.
 */
@Injectable()
export class TaslakService {
  private readonly logger = new Logger(TaslakService.name);

  constructor(private prisma: PrismaService) {}

  async getir(userId: string) {
    const t = await this.prisma.listingDraft.findUnique({ where: { userId } });
    if (!t) return null;
    return {
      payload: t.payload,
      imageUrls: t.imageUrls,
      step: t.step,
      updatedAt: t.updatedAt,
    };
  }

  /**
   * Taslagi yazar (tek satir, uzerine yazar).
   *
   * Alanlar beyaz listeye gore suzuluyor (taslak-alanlari.ts): istemciye
   * sonradan eklenen bir alan - ornegin T.C. kimlik numarasi - buraya
   * sizamiyor. Fotograf adresleri de ilan olustururken kullanilan ayni
   * dogrulamadan geciyor, yani yalnizca bizim yukleme dizinimiz kabul
   * ediliyor.
   */
  async kaydet(userId: string, girdi: { payload?: unknown; imageUrls?: string[]; step?: number }) {
    const payload = taslagiTemizle(girdi.payload);
    const imageUrls = (girdi.imageUrls ?? []).slice(0, TASLAK_EN_FAZLA_FOTO);
    if (imageUrls.length) gorselleriDogrula(imageUrls);
    const step = Math.min(Math.max(Math.trunc(girdi.step ?? 1), 1), 4);

    await this.prisma.listingDraft.upsert({
      where: { userId },
      create: { userId, payload, imageUrls, step },
      update: { payload, imageUrls, step },
    });
    return { kaydedildi: true };
  }

  /**
   * Taslagi siler.
   *
   * Hata firlatmiyor: ilan basariyla gonderildikten sonra cagriliyor ve
   * taslak zaten yoksa bu bir hata degil.
   */
  async sil(userId: string) {
    await this.prisma.listingDraft.deleteMany({ where: { userId } });
    return { silindi: true };
  }

  /**
   * Sahipsiz yuklemeleri temizler.
   *
   * Fotograf once sunucuya yukleniyor, ilan sonra olusuyor. Arada
   * vazgecen kullanicinin dosyasi diskte kaliyordu ve hicbir sey onu
   * silmiyordu. Taslaktaki fotograflar KORUNUYOR - taslagin amaci zaten
   * onlari saklamak.
   *
   * @param gunSiniri Bu yastan eski ve hicbir ilana/taslaga bagli
   *   olmayan dosyalar siliniyor. Yukleme ile ilan olusturma arasinda
   *   gunlerce beklenebilir, bu yuzden sinir genis tutuluyor.
   */
  async sahipsizYuklemeleriTemizle(gunSiniri = 30): Promise<{ silinen: number; korunan: number }> {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const dizin = path.join(process.cwd(), 'uploads');

    let dosyalar: string[];
    try {
      dosyalar = await fs.readdir(dizin);
    } catch {
      return { silinen: 0, korunan: 0 }; // dizin yoksa yapacak is yok
    }

    const [ilanGorselleri, taslaklar] = await Promise.all([
      this.prisma.listingImage.findMany({ select: { url: true } }),
      this.prisma.listingDraft.findMany({ select: { imageUrls: true } }),
    ]);
    const bekleyen = await this.prisma.listingPendingEdit.findMany({ select: { imageUrls: true } });

    // Adresin son parcasi dosya adi.
    const kullanilan = new Set<string>();
    const ekle = (url: string) => kullanilan.add(url.split('/').pop() ?? '');
    ilanGorselleri.forEach((g) => ekle(g.url));
    taslaklar.forEach((t) => t.imageUrls.forEach(ekle));
    bekleyen.forEach((b) => b.imageUrls.forEach(ekle));

    const sinir = Date.now() - gunSiniri * 24 * 60 * 60 * 1000;
    let silinen = 0;
    let korunan = 0;

    for (const ad of dosyalar) {
      if (kullanilan.has(ad)) { korunan++; continue; }
      try {
        const bilgi = await fs.stat(path.join(dizin, ad));
        if (!bilgi.isFile() || bilgi.mtimeMs > sinir) { korunan++; continue; }
        await fs.unlink(path.join(dizin, ad));
        silinen++;
      } catch {
        // Dosya bu arada silinmis ya da okunamiyor: atla.
      }
    }
    if (silinen) this.logger.log(`Sahipsiz yukleme temizlendi: ${silinen} dosya (>${gunSiniri} gun)`);
    return { silinen, korunan };
  }

  /**
   * Cok eski taslaklari duser. Taslak formu kaybetmemek icin var; aylar
   * once birakilmis bir form artik kimsenin isine yaramiyor.
   */
  async eskiTaslaklariSil(gun = 90): Promise<number> {
    const sinir = new Date(Date.now() - gun * 24 * 60 * 60 * 1000);
    const { count } = await this.prisma.listingDraft.deleteMany({
      where: { updatedAt: { lt: sinir } },
    });
    if (count) this.logger.log(`${count} eski taslak silindi (>${gun} gun)`);
    return count;
  }
}

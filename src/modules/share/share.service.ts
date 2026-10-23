import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createHash } from 'crypto';
import sharp from 'sharp';
import { kadrajiCoz } from '../listings/kadraj';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { readFile, writeFile, rename } from 'fs/promises';
import { randomBytes } from 'crypto';

// Instagram Story olcusu. Kart bu olcude uretilir ki kullanici kirpmak
// zorunda kalmasin; WhatsApp ve X paylasimlarinda da sorunsuz gorunur.
const GENISLIK = 1080;
const YUKSEKLIK = 1920;

// Site paleti — globals.css'teki degerlerin sRGB karsiliklari.
const KREM = '#FBFAF8';
const MURECCEP = '#121318';
const ACCENT = '#D83E13';
const SOLUK = '#85878F';

// Instagram arayuzu kartin en ust ve en alt seridini kapatiyor (profil
// adi, yanit kutusu, paylasim dugmeleri). Onemli hicbir sey bu bantlara
// girmemeli; icerigi guvenli alana sikistiriyoruz.
const UST_GUVENLI = 290;
const ALT_GUVENLI = YUKSEKLIK - 300; // 1620

const FOTO = { x: 90, y: 548, g: 900, y2: 742 };

// Site logosunun kendisi. Onceden "MOTORYA" yazisi SVG metni olarak
// ciziliyordu; harf bicimleri sitedeki logoyla ayni degildi.
const LOGO_YOLU = join(process.cwd(), 'assets', 'marka', 'logo-wordmark.png');
const LOGO = { g: 420, y: 116 };

// Uretilen kartlar burada saklanir. Her kart bir kez uretilir; ilan
// degistiginde dosya adindaki damga degistigi icin yenisi uretilir.
const KART_DIZINI = join(process.cwd(), 'uploads', 'kart');

// Kart tasarimi degistiginde onbellekteki eski gorseller servis edilmeye
// devam ediyordu. Tasarima dokunan her degisiklikte bu surumu artir.
const KART_SURUMU = 'v2';

@Injectable()
export class ShareService {
  constructor(private prisma: PrismaService) {
    mkdirSync(KART_DIZINI, { recursive: true });
  }

  async ilanKarti(slugYaDaId: string): Promise<Buffer> {
    // Ilan slug'i "...-{id}" ile biter; slug geldiyse kuyrugundaki id'yi aliriz.
    const id = slugYaDaId.includes('-') ? slugYaDaId.split('-').pop()! : slugYaDaId;

    const ilan = await this.prisma.listing.findFirst({
      // Test ilanina kart uretilmiyor. Kart Instagram'a atilmak icin
      // uretiliyor; test ilani aramada ve listelerde gorunmezken kartinin
      // disariya cikabilmesi, isaretin amacini bosa cikarirdi.
      //
      // Onbellek bu kontrolden SONRA bakiliyor, yani ilan sonradan test
      // isaretlenirse daha once uretilmis kart da servis edilmiyor.
      where: { id, status: 'ACTIVE', deletedAt: null, isTest: false },
      select: {
        id: true,
        updatedAt: true,
        title: true,
        price: true,
        city: true,
        sizeLabel: true,
        brand: { select: { name: true } },
        images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true, crop: true } },
      },
    });
    if (!ilan) throw new NotFoundException('Ilan bulunamadi');

    // Kart uretimi istek basina ~1 saniye islemci harciyor ve uc herkese
    // acik. Onbelleklemeden, tek bir istemci mevcut hiz siniri icinde
    // kalarak sunucunun islemcisini doldurabiliyordu.
    /**
     * Onbellek anahtari kadraji da iceriyor.
     *
     * Kadraj `ListingImage` satirinda duruyor; `Listing.updatedAt`'in
     * her kadraj degisikliginde kesinlikle degistigine guvenemeyiz.
     * Anahtara koymazsak satici kadraji degistirdikten sonra ESKI kart
     * donmeye devam ederdi - uretilmis ama kimsenin goremedigi bir
     * duzeltme.
     *
     * Kadrajsiz ilanlarda ek bir parca eklenmiyor; mevcut kartlarin
     * anahtarlari degismiyor, yani bu degisiklik onbellegi bosaltmiyor.
     */
    const kadrajImzasi = ilan.images[0]?.crop
      ? '-k' + createHash('sha1').update(JSON.stringify(ilan.images[0].crop)).digest('hex').slice(0, 8)
      : '';
    const onbellek = join(
      KART_DIZINI,
      `${ilan.id}-${ilan.updatedAt.getTime()}-${KART_SURUMU}${kadrajImzasi}.png`,
    );
    if (existsSync(onbellek)) {
      return readFile(onbellek);
    }

    // Kapak kadraji da gonderiliyor: satici neyi kapak sectiyse Story
    // karti da onu gostermeli.
    const foto = await this.fotoKatmani(ilan.images[0]?.url, ilan.images[0]?.crop);
    const svg = this.kartSvg({
      fotoVar: !!foto,
      baslik: ilan.title,
      fiyat: Number(ilan.price),
      sehir: ilan.city,
      beden: ilan.sizeLabel,
      marka: ilan.brand?.name ?? null,
    });

    const katmanlar: Parameters<ReturnType<typeof sharp>['composite']>[0] = [];
    if (foto) katmanlar.push({ input: foto, left: FOTO.x, top: FOTO.y });
    katmanlar.push({ input: Buffer.from(svg) });

    // Logo en uste biniyor. Dosya okunamazsa kart yine uretiliyor; eksik
    // logo, kartin hic olusmamasindan iyidir.
    if (existsSync(LOGO_YOLU)) {
      try {
        const logo = await sharp(LOGO_YOLU).resize({ width: LOGO.g }).png().toBuffer();
        katmanlar.push({ input: logo, left: 90, top: UST_GUVENLI + 10 });
      } catch {
        // gec
      }
    }

    const png = await sharp({
      create: {
        width: GENISLIK,
        height: YUKSEKLIK,
        channels: 4,
        background: KREM,
      },
    })
      .composite(katmanlar)
      .png({ compressionLevel: 9 })
      .toBuffer();

    // Once gecici ada yazip tasiyoruz: iki istek ayni anda uretirse
    // yarim yazilmis bir dosya okunmasin.
    const gecici = `${onbellek}.${randomBytes(6).toString('hex')}.tmp`;
    try {
      await writeFile(gecici, png);
      await rename(gecici, onbellek);
    } catch {
      // Onbellege yazilamazsa kart yine donmeli; yalnizca hiz kaybi olur.
    }

    return png;
  }

  /**
   * Urun fotografini kartin olcusune getirir ve kosegenleri yuvarlar.
   *
   * ── KADRAJ ────────────────────────────────────────────────────────
   *
   * Satici bir kapak kadraji sectiyse Story karti da ONU kullaniyor.
   * Onceden kadraj hic okunmuyordu ve fotograf `position: 'attention'`
   * ile OTOMATIK kirpiliyordu: sharp'in dikkat algoritmasi en "ilgi
   * cekici" alani seciyor, bu da mont ve bot gibi uzun urunlerde
   * urunun yarisini kesebiliyordu. Saticinin kart icin ozellikle
   * sectigi cerceve gorunmuyordu.
   *
   * Kadraj yoksa eski davranis korunuyor: mevcut kartlarin gorunumu
   * degismesin diye bilerek dokunulmadi.
   *
   * Kadraj orani (4/3.4 = 1.176) ile Story foto kutusunun orani
   * (900/742 = 1.213) birebir ayni degil; secilen bolge kutuya `cover`
   * ile oturtulurken yukaridan/asagidan ~%2 kirpilabiliyor. Bu fark
   * gozle secilmiyor ve kadraji tamamen yok saymaktan cok daha iyi.
   */
  private async fotoKatmani(url?: string, kadraj?: unknown): Promise<Buffer | null> {
    if (!url) return null;
    const dosyaAdi = url.split('/').pop();
    if (!dosyaAdi) return null;
    const yol = join(process.cwd(), 'uploads', dosyaAdi);
    if (!existsSync(yol)) return null;

    const maske = Buffer.from(
      `<svg width="${FOTO.g}" height="${FOTO.y2}"><rect width="${FOTO.g}" height="${FOTO.y2}" rx="28" ry="28" fill="#fff"/></svg>`,
    );

    try {
      let boru = sharp(yol);
      const k = kadrajiCoz(kadraj);

      if (k) {
        const m = await boru.metadata();
        if (m.width && m.height) {
          // Oransal kadraj -> piksel. Siniri asmamasi icin kirpiliyor;
          // bozuk bir deger yuzunden kartin hic uretilememesi, kadrajsiz
          // uretilmesinden kotu olurdu.
          const left = Math.max(0, Math.min(m.width - 1, Math.round(k.x * m.width)));
          const top = Math.max(0, Math.min(m.height - 1, Math.round(k.y * m.height)));
          const width = Math.max(1, Math.min(m.width - left, Math.round(k.w * m.width)));
          const height = Math.max(1, Math.min(m.height - top, Math.round(k.h * m.height)));
          boru = boru.extract({ left, top, width, height });
        }
      }

      return await boru
        // Kadraj varsa bolge zaten secilmis; merkezden oturtuyoruz.
        // Kadraj yoksa eski 'attention' davranisi suruyor.
        .resize(FOTO.g, FOTO.y2, { fit: 'cover', position: k ? 'centre' : 'attention' })
        .composite([{ input: maske, blend: 'dest-in' }])
        .png()
        .toBuffer();
    } catch {
      return null;
    }
  }

  // Baslik iki satira kadar sigar; Saira'da 44px'te karakter genisligi
  // yaklasik 23px, buna gore kirpiyoruz.
  private basligiBol(baslik: string, satirBasina: number): string[] {
    const kelimeler = baslik.trim().split(/\s+/);
    const satirlar: string[] = [];
    let aktif = '';
    for (const k of kelimeler) {
      const aday = aktif ? `${aktif} ${k}` : k;
      if (aday.length > satirBasina && aktif) {
        satirlar.push(aktif);
        aktif = k;
        if (satirlar.length === 2) break;
      } else {
        aktif = aday;
      }
    }
    if (satirlar.length < 2 && aktif) satirlar.push(aktif);
    if (satirlar.length === 2 && aktif && satirlar[1] !== aktif) {
      satirlar[1] = satirlar[1].slice(0, satirBasina - 1) + '…';
    }
    return satirlar.slice(0, 2);
  }

  private kartSvg(d: {
    baslik: string;
    fiyat: number;
    sehir: string | null;
    beden: string | null;
    marka: string | null;
    fotoVar: boolean;
  }): string {
    // Sitedeki bicimle ayni: "15.000 ₺" (bkz. frontend lib/utils formatPrice).
    const fiyat = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(d.fiyat) + ' ₺';
    const satirlar = this.basligiBol(d.baslik, 26);
    const rozetler = [d.marka, d.beden ? `Beden ${d.beden}` : null, d.sehir]
      .filter(Boolean)
      .join('  ·  ');

    // Iki satirlik baslik fiyata fazla yaklasiyordu; satir sayisina gore
    // blogu yukari aliyoruz.
    const baslikTabani = FOTO.y + FOTO.y2 + (satirlar.length > 1 ? 66 : 84);
    const baslikSvg = satirlar
      .map((s, i) => `<text x="90" y="${baslikTabani + i * 58}" class="baslik">${kacir(s)}</text>`)
      .join('');

    // Fotograf okunamadiginda ortada 742 piksellik bos bir alan kaliyordu.
    // Kartin bozuk gorunmemesi icin oraya sade bir marka paneli koyuyoruz.
    const fotoYedek = d.fotoVar ? '' : `
  <rect x="${FOTO.x}" y="${FOTO.y}" width="${FOTO.g}" height="${FOTO.y2}" rx="28" fill="#F1EFEA"/>
  <text x="${FOTO.x + FOTO.g / 2}" y="${FOTO.y + FOTO.y2 / 2 + 12}" text-anchor="middle" class="alt">Fotoğraf için ilana göz at</text>`;

    return `<svg width="${GENISLIK}" height="${YUKSEKLIK}" xmlns="http://www.w3.org/2000/svg">
  <style>
    text { font-family: 'Saira'; }
    .rozet { font-size: 26px; font-weight: 700; letter-spacing: 2px; fill: #ffffff; }
    .baslik { font-size: 50px; font-weight: 700; fill: ${MURECCEP}; }
    .fiyat { font-size: 96px; font-weight: 800; fill: ${ACCENT}; letter-spacing: -2px; }
    .alt { font-size: 29px; font-weight: 700; fill: ${SOLUK}; }
    .cta { font-size: 32px; font-weight: 700; fill: ${MURECCEP}; }
    .adres { font-size: 29px; font-weight: 700; fill: ${SOLUK}; letter-spacing: 1px; }
  </style>

  <!-- Logo gorsel olarak ustte birlestiriliyor; burada yalnizca altindaki
       cizgi var. Guvenli alanin icinde duruyor. -->
  <rect x="90" y="${UST_GUVENLI + 146}" width="900" height="5" rx="2" fill="${ACCENT}"/>
  ${fotoYedek}

  <!-- Satilik rozeti -->
  <rect x="90" y="${UST_GUVENLI + 166}" width="206" height="62" rx="31" fill="${ACCENT}"/>
  <text x="193" y="${UST_GUVENLI + 208}" class="rozet" text-anchor="middle">SATILIK</text>

  <!-- Baslik, fiyat, kunye: hepsi alt guvenli sinirin ustunde -->
  ${baslikSvg}
  <text x="90" y="${ALT_GUVENLI - 124}" class="fiyat">${kacir(fiyat)}</text>
  ${rozetler ? `<text x="90" y="${ALT_GUVENLI - 74}" class="alt">${kacir(rozetler)}</text>` : ''}

  <rect x="90" y="${ALT_GUVENLI - 52}" width="900" height="2" rx="1" fill="#E3E0D8"/>
  <text x="90" y="${ALT_GUVENLI - 20}" class="cta">İlanı Motorya'da keşfet</text>
  <text x="990" y="${ALT_GUVENLI - 20}" class="adres" text-anchor="end">motorya.com.tr</text>
</svg>`;
  }
}

// SVG metin alanlarina kullanici ureten baslik giriyor; kacirilmazsa
// icindeki & veya < karakteri belgeyi bozar.
function kacir(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

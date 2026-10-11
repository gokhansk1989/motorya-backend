import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import sharp from 'sharp';
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

@Injectable()
export class ShareService {
  constructor(private prisma: PrismaService) {
    mkdirSync(KART_DIZINI, { recursive: true });
  }

  async ilanKarti(slugYaDaId: string): Promise<Buffer> {
    // Ilan slug'i "...-{id}" ile biter; slug geldiyse kuyrugundaki id'yi aliriz.
    const id = slugYaDaId.includes('-') ? slugYaDaId.split('-').pop()! : slugYaDaId;

    const ilan = await this.prisma.listing.findFirst({
      where: { id, status: 'ACTIVE', deletedAt: null },
      select: {
        id: true,
        updatedAt: true,
        title: true,
        price: true,
        city: true,
        sizeLabel: true,
        brand: { select: { name: true } },
        images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
      },
    });
    if (!ilan) throw new NotFoundException('Ilan bulunamadi');

    // Kart uretimi istek basina ~1 saniye islemci harciyor ve uc herkese
    // acik. Onbelleklemeden, tek bir istemci mevcut hiz siniri icinde
    // kalarak sunucunun islemcisini doldurabiliyordu.
    const onbellek = join(KART_DIZINI, `${ilan.id}-${ilan.updatedAt.getTime()}.png`);
    if (existsSync(onbellek)) {
      return readFile(onbellek);
    }

    const foto = await this.fotoKatmani(ilan.images[0]?.url);
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

  // Urun fotografini kartin olcusune getirir ve kosegenleri yuvarlar.
  // Fotograf yoksa kart yine uretilir; yerine bos bir alan kalir.
  private async fotoKatmani(url?: string): Promise<Buffer | null> {
    if (!url) return null;
    const dosyaAdi = url.split('/').pop();
    if (!dosyaAdi) return null;
    const yol = join(process.cwd(), 'uploads', dosyaAdi);
    if (!existsSync(yol)) return null;

    const maske = Buffer.from(
      `<svg width="${FOTO.g}" height="${FOTO.y2}"><rect width="${FOTO.g}" height="${FOTO.y2}" rx="28" ry="28" fill="#fff"/></svg>`,
    );

    try {
      return await sharp(yol)
        .resize(FOTO.g, FOTO.y2, { fit: 'cover', position: 'attention' })
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

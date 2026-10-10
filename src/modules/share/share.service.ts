import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import sharp from 'sharp';
import { join } from 'path';
import { existsSync } from 'fs';

// Instagram Story olcusu. Kart bu olcude uretilir ki kullanici kirpmak
// zorunda kalmasin; WhatsApp ve X paylasimlarinda da sorunsuz gorunur.
const GENISLIK = 1080;
const YUKSEKLIK = 1920;

// Site paleti — globals.css'teki degerlerin sRGB karsiliklari.
const KREM = '#FBFAF8';
const MURECCEP = '#121318';
const ACCENT = '#D83E13';
const SOLUK = '#85878F';

const FOTO = { x: 90, y: 430, g: 900, y2: 900 };

@Injectable()
export class ShareService {
  constructor(private prisma: PrismaService) {}

  async ilanKarti(slugYaDaId: string): Promise<Buffer> {
    // Ilan slug'i "...-{id}" ile biter; slug geldiyse kuyrugundaki id'yi aliriz.
    const id = slugYaDaId.includes('-') ? slugYaDaId.split('-').pop()! : slugYaDaId;

    const ilan = await this.prisma.listing.findFirst({
      where: { id, status: 'ACTIVE', deletedAt: null },
      select: {
        title: true,
        price: true,
        city: true,
        sizeLabel: true,
        brand: { select: { name: true } },
        images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
      },
    });
    if (!ilan) throw new NotFoundException('Ilan bulunamadi');

    const foto = await this.fotoKatmani(ilan.images[0]?.url);
    const svg = this.kartSvg({
      baslik: ilan.title,
      fiyat: Number(ilan.price),
      sehir: ilan.city,
      beden: ilan.sizeLabel,
      marka: ilan.brand?.name ?? null,
    });

    const katmanlar: Parameters<ReturnType<typeof sharp>['composite']>[0] = [];
    if (foto) katmanlar.push({ input: foto, left: FOTO.x, top: FOTO.y });
    katmanlar.push({ input: Buffer.from(svg) });

    return sharp({
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
  }): string {
    const fiyat = new Intl.NumberFormat('tr-TR').format(d.fiyat) + ' ₺';
    const satirlar = this.basligiBol(d.baslik, 26);
    const rozetler = [d.marka, d.beden ? `Beden ${d.beden}` : null, d.sehir]
      .filter(Boolean)
      .join('  ·  ');

    const baslikSvg = satirlar
      .map((s, i) => `<text x="90" y="${1450 + i * 62}" class="baslik">${kacir(s)}</text>`)
      .join('');

    return `<svg width="${GENISLIK}" height="${YUKSEKLIK}" xmlns="http://www.w3.org/2000/svg">
  <style>
    text { font-family: 'Saira'; }
    .logo { font-size: 72px; font-weight: 800; letter-spacing: -3px; fill: ${MURECCEP}; }
    .rozet { font-size: 26px; font-weight: 700; letter-spacing: 2px; fill: #ffffff; }
    .baslik { font-size: 52px; font-weight: 700; fill: ${MURECCEP}; }
    .fiyat { font-size: 104px; font-weight: 800; fill: ${ACCENT}; letter-spacing: -2px; }
    .alt { font-size: 30px; font-weight: 700; fill: ${SOLUK}; }
    .cta { font-size: 34px; font-weight: 700; fill: ${MURECCEP}; }
    .adres { font-size: 30px; font-weight: 700; fill: ${SOLUK}; letter-spacing: 1px; }
  </style>

  <!-- Marka -->
  <text x="90" y="200" class="logo"><tspan fill="${ACCENT}">M</tspan>OTORYA</text>
  <rect x="90" y="248" width="900" height="5" rx="2" fill="${ACCENT}"/>

  <!-- Satilik rozeti -->
  <rect x="90" y="310" width="206" height="62" rx="31" fill="${ACCENT}"/>
  <text x="193" y="352" class="rozet" text-anchor="middle">SATILIK</text>

  <!-- Baslik, fiyat, kunye -->
  ${baslikSvg}
  <text x="90" y="1610" class="fiyat">${kacir(fiyat)}</text>
  ${rozetler ? `<text x="90" y="1668" class="alt">${kacir(rozetler)}</text>` : ''}

  <!-- Alt serit -->
  <rect x="90" y="1736" width="900" height="2" rx="1" fill="#E3E0D8"/>
  <text x="90" y="1806" class="cta">İlanı Motorya'da keşfet →</text>
  <text x="990" y="1806" class="adres" text-anchor="end">motorya.com.tr</text>
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

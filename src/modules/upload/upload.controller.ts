import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { mkdirSync } from 'fs';
import { writeFile, readFile, rm, mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import sharp from 'sharp';

const calistir = promisify(execFile);

const UPLOADS_DIR = join(process.cwd(), 'uploads');
mkdirSync(UPLOADS_DIR, { recursive: true });

// Istemcinin gonderdigi Content-Type ucuz bir on eleme; guvenlik karari degil.
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

// Asil kontrol bu: sharp bicimi dosya icerigine gore belirliyor. Onceden
// yalnizca Content-Type'a bakiliyordu ve bu baslik tamamen istemci
// denetiminde - "image/png" etiketli bir SVG kabul ediliyor, sharp onu SVG
// olarak cozuyordu. Yani hangi cozucunun calisacagini yukleyen secebiliyordu.
const IZINLI_BICIM = ['jpeg', 'png', 'webp', 'heif', 'avif'];

/**
 * HEIC/HEIF: sharp cozemiyor, ayri bir cozucuden geciriyoruz.
 *
 * sharp'in hazir ikilisindeki libvips, HEVC kod cozucusu olmadan
 * derlenmis. Sinsi tarafi: `metadata()` yalnizca KABI okudugu icin
 * basariyla doner ve bicimi "heif" der - izinli bicim listesinden
 * gecer - ama piksel cozumu "Support for this compression format has
 * not been built in" ile patlar. Eski kod bunu genel catch'e dusurup
 * kullaniciya "dosyan bozuk olabilir" diyordu.
 *
 * AVIF ayni kabi kullandigi icin bicim adi orada da "heif" gorunur ama
 * AVIF cozulebiliyor. Bu yuzden bicim adina gore degil, cozumun
 * SONUCUNA gore karar veriyoruz: once normal yol denenir, yalnizca
 * HEVC hatasi gelirse harici cozucuye dusulur.
 */
const HEVC_COZULEMEDI = /compression format has not been built|no decoder|unsupported.*heic/i;

/**
 * HEIC'i ara bir JPEG'e cevirir; sonrasi normal boru hattindan gecer
 * (EXIF yonu duzeltilir, 1920'ye kuculur, WebP'ye donusur).
 *
 * Alt surec olarak CALISTIRILIYOR cunku kod cozucu sharp'ta yok.
 * `execFile` kullaniliyor - kabuk araya girmiyor, yani dosya adi
 * uzerinden komut enjeksiyonu mumkun degil; zaten gecici dosya adini
 * biz uretiyoruz, kullanicinin adi hic kullanilmiyor.
 *
 * Zaman asimi var: bozuk ya da kotu niyetli bir dosya cozucuyu
 * kilitlerse istek sonsuza kadar beklemesin.
 */
const HEIC_ZAMAN_ASIMI_MS = 20_000;

async function heicCoz(girdi: Buffer): Promise<Buffer> {
  const dizin = await mkdtemp(join(tmpdir(), 'heic-'));
  const kaynak = join(dizin, 'in.heic');
  const hedef = join(dizin, 'out.jpg');
  try {
    await writeFile(kaynak, girdi);
    await calistir('heif-convert', ['-q', '92', kaynak, hedef], {
      timeout: HEIC_ZAMAN_ASIMI_MS,
      maxBuffer: 1024 * 1024,
    });
    return await readFile(hedef);
  } finally {
    // Ara dosyalar her durumda siliniyor: hata yolunda birakmak,
    // diskte kimsenin bakmadigi fotograflar biriktirirdi.
    await rm(dizin, { recursive: true, force: true }).catch(() => {});
  }
}


// İlan fotoğrafları her zaman bu boyuta indirilip WebP'ye çevrilir — disk/bant
// genişliği tasarrufu ve HEIC gibi tarayıcının doğrudan render edemediği
// formatların evrensel olarak desteklenmesi için.
const MAX_DIMENSION = 1920;
const WEBP_QUALITY = 82;

@Controller('upload')
export class UploadController {
  @Post('images')
  @UseGuards(AuthGuard('jwt'))
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @UseInterceptors(
    FilesInterceptor('files', 8, {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME.includes(file.mimetype)) {
          cb(null, true);
        } else {
          // Kullaniciya MIME turu gostermenin bir faydasi yok;
          // "text/plain" ne yapacagini soylemiyor. Ne kabul ettigimizi
          // soyluyoruz.
          cb(
            new UnsupportedMediaTypeException(
              'Bu dosya desteklenmiyor. JPEG, PNG, WebP veya HEIC fotoğraf seç.',
            ),
            false,
          );
        }
      },
    }),
  )
  async uploadImages(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0) throw new BadRequestException('Dosya bulunamadı');

    const baseUrl = process.env.BASE_URL ?? 'https://motorya.com.tr/api-backend';

    /**
     * Dosyalar TEK TEK degerlendiriliyor.
     *
     * Onceden `Promise.all` vardi ve ilk reddeden dosya tum istegi
     * dusuruyordu: sekiz fotografin yedisi islenmis olsa bile
     * kullanici hicbirini alamiyor, basarili olanlar da diske yazilmis
     * olabildigi icin hicbir ilana bagli olmayan dosyalar kaliyordu.
     * Artik basarili olanlar donuyor, basarisiz olanlar sebebiyle
     * birlikte ayrica bildiriliyor.
     */
    const urls: string[] = [];
    const hatalar: { ad: string; kod: string; mesaj: string }[] = [];

    for (const file of files) {
      // Dosya adi YALNIZCA kullaniciya gosterilen mesajda; olcume
      // gonderilen sey yalnizca `kod` alani.
      const ad = file.originalname;

      let bicim: string | undefined;
      try {
        bicim = (await sharp(file.buffer).metadata()).format;
      } catch {
        hatalar.push({ ad, kod: 'bozuk', mesaj: `"${ad}" açılamadı. Dosya bozulmuş olabilir; başka bir fotoğraf dene.` });
        continue;
      }

      if (!bicim || !IZINLI_BICIM.includes(bicim)) {
        hatalar.push({
          ad,
          kod: 'tip',
          mesaj: `"${ad}" bir fotoğraf değil ya da biçimi desteklenmiyor. JPEG, PNG, WebP veya HEIC seç.`,
        });
        continue;
      }

      /**
       * Kucultme ve donusturme HER dosya icin ayni: EXIF yonu
       * duzeltilir, uzun kenar 1920'ye indirilir (buyutulmez) ve WebP'ye
       * cevrilir. Meta veri (EXIF konumu dahil) bu adimda dusuyor.
       */
      const kucultVeCevir = (g: Buffer) =>
        sharp(g)
          .rotate() // EXIF orientation'a göre düzelt, sonra meta veriyi at
          .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: WEBP_QUALITY })
          .toBuffer();

      let processed: Buffer;
      try {
        processed = await kucultVeCevir(file.buffer);
      } catch (e: any) {
        // HEIC: sharp cozemedi, harici cozucuyle bir kez daha dene.
        // Basarili olursa kullanici hicbir fark gormez - fotografi
        // digerleriyle ayni sekilde kuculup kaydedilir.
        if (HEVC_COZULEMEDI.test(String(e?.message ?? ''))) {
          try {
            processed = await kucultVeCevir(await heicCoz(file.buffer));
          } catch {
            hatalar.push({
              ad,
              kod: 'heic',
              mesaj:
                `"${ad}" HEIC biçiminde ve açılamadı. ` +
                `Fotoğrafı JPEG olarak paylaşarak devam edebilirsin.`,
            });
            continue;
          }
        } else {
          hatalar.push({ ad, kod: 'bozuk', mesaj: `"${ad}" açılamadı. Dosya bozulmuş olabilir; başka bir fotoğraf dene.` });
          continue;
        }
      }

      const filename = `${randomBytes(12).toString('hex')}.webp`;
      await writeFile(join(UPLOADS_DIR, filename), processed);
      urls.push(`${baseUrl}/uploads/${filename}`);
    }

    // Hicbiri gecmediyse istegin tamami basarisiz: istemci bunu tek bir
    // hata olarak gosterebilsin. Bicim hatasinda 415 donuyor; 400
    // donerken istemci bunu "istek" diye siniflandiriyor ve olcumde
    // "desteklenmeyen tur" diye bir sebep hic gorunmuyordu.
    if (urls.length === 0) {
      const hepsiTip = hatalar.every((h) => h.kod === 'tip' || h.kod === 'heic');
      const mesaj = hatalar.map((h) => h.mesaj).join(' ');
      if (hepsiTip) throw new UnsupportedMediaTypeException(mesaj);
      throw new BadRequestException(mesaj);
    }

    // Kismi basari: yuklenenler donuyor, kalanlar sebebiyle bildiriliyor.
    return { urls, hatalar };
  }
}

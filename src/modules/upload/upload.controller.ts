import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import sharp from 'sharp';

const UPLOADS_DIR = join(process.cwd(), 'uploads');
mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

// İlan fotoğrafları her zaman bu boyuta indirilip WebP'ye çevrilir — disk/bant
// genişliği tasarrufu ve HEIC gibi tarayıcının doğrudan render edemediği
// formatların evrensel olarak desteklenmesi için.
const MAX_DIMENSION = 1920;
const WEBP_QUALITY = 82;

@Controller('upload')
export class UploadController {
  @Post('images')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(
    FilesInterceptor('files', 8, {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException(`Desteklenmeyen format: ${file.mimetype}`), false);
        }
      },
    }),
  )
  async uploadImages(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0) throw new BadRequestException('Dosya bulunamadı');

    const baseUrl = process.env.BASE_URL ?? 'https://motorya.com.tr/api-backend';

    const urls = await Promise.all(
      files.map(async (file) => {
        let processed: Buffer;
        try {
          processed = await sharp(file.buffer)
            .rotate() // EXIF orientation'a göre düzelt, sonra meta veriyi at
            .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: WEBP_QUALITY })
            .toBuffer();
        } catch {
          throw new BadRequestException(`"${file.originalname}" işlenemedi — dosya bozuk olabilir`);
        }

        const filename = `${randomBytes(12).toString('hex')}.webp`;
        await writeFile(join(UPLOADS_DIR, filename), processed);
        return `${baseUrl}/uploads/${filename}`;
      }),
    );

    return { urls };
  }
}

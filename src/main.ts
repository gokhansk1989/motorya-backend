import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { AppModule } from './app.module';
import { getAllowedOrigins } from './common/cors-origins';
import { AllExceptionsFilter } from './modules/error-logs/all-exceptions.filter';
import { SlowRequestInterceptor } from './modules/error-logs/slow-request.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // API domain'i (api.motorya.com.tr) Google indeksinden hariç tut. Ozellikle
  // /auth/google gibi endpoint'ler GSC raporlarinda 404 uretiyor.
  app.use((_req: any, res: any, next: any) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  app.useGlobalFilters(app.get(AllExceptionsFilter));
  app.useGlobalInterceptors(app.get(SlowRequestInterceptor));

  const uploadsDir = join(process.cwd(), 'uploads');
  mkdirSync(uploadsDir, { recursive: true });
  app.useStaticAssets(uploadsDir, {
    prefix: '/uploads',
    // Dosya adları içerik hash'i taşıdığından süresiz cache güvenli
    maxAge: '365d',
    immutable: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: getAllowedOrigins(),
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Motorya API')
    .setDescription('Motosiklet ekipman pazarı — REST API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 Motorya backend running on http://localhost:${port}`);
  console.log(`📖 Swagger UI: http://localhost:${port}/api`);
}

bootstrap();

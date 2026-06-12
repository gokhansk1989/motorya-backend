import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') || [
      'http://localhost:3001',
      'http://localhost:3002',
      'http://98.93.139.51',
      'http://98.93.139.51:3001',
      'http://98.93.139.51:3002',
      'http://motorya.com.tr',
      'https://motorya.com.tr',
      'http://www.motorya.com.tr',
      'https://www.motorya.com.tr',
      'http://admin.motorya.com.tr',
      'https://admin.motorya.com.tr',
    ],
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

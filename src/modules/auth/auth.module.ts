import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { GoogleStrategy } from './google.strategy';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { getJwtSecret } from '../../common/jwt-secret';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    MailModule,
    // AuthService sunucu tarafi uyelik olaylarini yaziyor. Bu import
    // OLMADAN TypeScript derleniyor ama NestJS calisma aninda bagimliligi
    // cozemeyip uygulamayi hic ayaga kaldirmiyor.
    AnalyticsModule,
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '2h' },
    }),
  ],
  providers: [AuthService, JwtStrategy, GoogleStrategy],
  controllers: [AuthController],
})
export class AuthModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './modules/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ListingsModule } from './modules/listings/listings.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { DisputesModule } from './modules/disputes/disputes.module';
import { AdminModule } from './modules/admin/admin.module';
import { OffersModule } from './modules/offers/offers.module';
import { HealthController } from './health.controller';
import { SearchModule } from './modules/search/search.module';
import { UploadModule } from './modules/upload/upload.module';
import { MessagesModule } from './modules/messages/messages.module';
import { SocialModule } from './modules/social/social.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ListingsModule,
    OrdersModule,
    PaymentsModule,
    ReviewsModule,
    DisputesModule,
    AdminModule,
    OffersModule,
    SearchModule,
    UploadModule,
    MessagesModule,
    SocialModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

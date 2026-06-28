import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { TasksModule } from './modules/tasks/tasks.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ListingsModule } from './modules/listings/listings.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { AdminModule } from './modules/admin/admin.module';
import { OffersModule } from './modules/offers/offers.module';
import { HealthController } from './health.controller';
import { SearchModule } from './modules/search/search.module';
import { UploadModule } from './modules/upload/upload.module';
import { MessagesModule } from './modules/messages/messages.module';
import { SocialModule } from './modules/social/social.module';
import { SavedSearchModule } from './modules/saved-search/saved-search.module';
import { BlogModule } from './modules/blog/blog.module';
import { PagesModule } from './modules/pages/pages.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { AuditModule } from './modules/audit/audit.module';
import { SettingsModule } from './modules/settings/settings.module';
import { ErrorLogsModule } from './modules/error-logs/error-logs.module';
import { FeedbackModule } from './modules/feedback/feedback.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
    SettingsModule,
    TasksModule,
    AuthModule,
    UsersModule,
    ListingsModule,
    ReviewsModule,
    AdminModule,
    OffersModule,
    SearchModule,
    UploadModule,
    MessagesModule,
    SocialModule,
    SavedSearchModule,
    BlogModule,
    PagesModule,
    IntegrationsModule,
    ErrorLogsModule,
    FeedbackModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}

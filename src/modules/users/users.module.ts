import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { WebPushService } from './webpush.service';
import { FcmService } from './fcm.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SearchModule } from '../search/search.module';
import { SocialModule } from '../social/social.module';

@Module({
  imports: [PrismaModule, SearchModule, SocialModule],
  providers: [UsersService, WebPushService, FcmService],
  controllers: [UsersController],
  exports: [UsersService, WebPushService, FcmService],
})
export class UsersModule {}

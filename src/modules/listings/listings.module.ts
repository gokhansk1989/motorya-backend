import { Module } from '@nestjs/common';
import { ListingsService } from './listings.service';
import { TaslakService } from './taslak.service';
import { ListingsController } from './listings.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { SearchModule } from '../search/search.module';
import { forwardRef } from '@nestjs/common';
import { SocialModule } from '../social/social.module';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [PrismaModule, forwardRef(() => SearchModule), SocialModule, MailModule, forwardRef(() => UsersModule)],
  providers: [ListingsService, TaslakService],
  controllers: [ListingsController],
  exports: [ListingsService, TaslakService],
})
export class ListingsModule {}

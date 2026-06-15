import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { MessagesGateway } from './messages.gateway';
import { EncryptionService } from './encryption.service';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { SocialModule } from '../social/social.module';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({ secret: process.env.JWT_SECRET }),
    SocialModule,
  ],
  controllers: [MessagesController],
  providers: [MessagesService, MessagesGateway, EncryptionService],
  exports: [MessagesGateway, MessagesService],
})
export class MessagesModule {}

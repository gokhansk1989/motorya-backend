import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { MessagesGateway } from './messages.gateway';
import { EncryptionService } from './encryption.service';
import { MessageFilterService } from './message-filter.service';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { SocialModule } from '../social/social.module';
import { getJwtSecret } from '../../common/jwt-secret';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({ secret: getJwtSecret() }),
    SocialModule,
    UsersModule,
  ],
  controllers: [MessagesController],
  providers: [MessagesService, MessagesGateway, EncryptionService, MessageFilterService],
  exports: [MessagesGateway, MessagesService],
})
export class MessagesModule {}

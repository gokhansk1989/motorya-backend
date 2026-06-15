import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { SearchModule } from '../search/search.module';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [PrismaModule, MailModule, SearchModule, MessagesModule],
  providers: [AdminService],
  controllers: [AdminController],
  exports: [AdminService],
})
export class AdminModule {}

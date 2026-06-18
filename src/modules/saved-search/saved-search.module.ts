import { Module } from '@nestjs/common';
import { SavedSearchService } from './saved-search.service';
import { SavedSearchController } from './saved-search.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [PrismaModule, UsersModule, MailModule],
  providers: [SavedSearchService],
  controllers: [SavedSearchController],
  exports: [SavedSearchService],
})
export class SavedSearchModule {}

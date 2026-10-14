import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ListingsModule } from '../listings/listings.module';

@Module({
  imports: [PrismaModule, MailModule, AnalyticsModule, ListingsModule],
  providers: [TasksService],
})
export class TasksModule {}

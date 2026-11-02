import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ListingsModule } from '../listings/listings.module';
import { ErrorLogsModule } from '../error-logs/error-logs.module';

@Module({
  imports: [PrismaModule, MailModule, AnalyticsModule, ListingsModule, ErrorLogsModule],
  providers: [TasksService],
})
export class TasksModule {}

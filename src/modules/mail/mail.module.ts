import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { IntegrationsModule } from '../integrations/integrations.module';
import { ErrorLogsModule } from '../error-logs/error-logs.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [IntegrationsModule, ErrorLogsModule, PrismaModule],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}

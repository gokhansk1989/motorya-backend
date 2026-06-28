import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { IntegrationsModule } from '../integrations/integrations.module';
import { ErrorLogsModule } from '../error-logs/error-logs.module';

@Module({
  imports: [IntegrationsModule, ErrorLogsModule],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}

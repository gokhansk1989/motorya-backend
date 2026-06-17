import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [IntegrationsModule],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}

import { BadRequestException, Controller, Get, Put, Param, Body, UseGuards } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UpdateIntegrationDto } from './dto/integrations.dto';

const KNOWN_KEYS = ['sendgrid', 'paytr', 'iyzico', 'netgsm', 'fcm', 's3'];

@Controller('integrations')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
export class IntegrationsController {
  constructor(private svc: IntegrationsService) {}

  @Get()
  list() { return this.svc.list(); }

  @Put(':key')
  update(@Param('key') key: string, @Body() body: UpdateIntegrationDto) {
    if (!KNOWN_KEYS.includes(key)) {
      throw new BadRequestException('Geçersiz entegrasyon anahtarı');
    }
    return this.svc.update(key, body.config, body.enabled);
  }
}

import { Controller, Get, Put, Param, Body, UseGuards } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('integrations')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
export class IntegrationsController {
  constructor(private svc: IntegrationsService) {}

  @Get()
  list() { return this.svc.list(); }

  @Put(':key')
  update(@Param('key') key: string, @Body() body: { config: Record<string, string>; enabled: boolean }) {
    return this.svc.update(key, body.config, body.enabled);
  }
}

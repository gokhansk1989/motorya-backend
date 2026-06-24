import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/settings.dto';

@Controller('admin/settings')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
export class SettingsController {
  constructor(private settings: SettingsService) {}

  @Get()
  getAll() {
    return this.settings.getAll();
  }

  @Patch()
  update(@Body() dto: UpdateSettingsDto) {
    return this.settings.setMany(dto as Record<string, boolean>);
  }
}

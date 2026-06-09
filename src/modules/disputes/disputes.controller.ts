import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { DisputesService } from './disputes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('disputes')
export class DisputesController {
  constructor(private disputesService: DisputesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async listDisputes() {
    // TODO: admin only
  }

  @Patch(':id/resolve')
  @UseGuards(JwtAuthGuard)
  async resolveDispute(@Param('id') id: string, @Body() dto: any) {
    // TODO: admin only
  }
}

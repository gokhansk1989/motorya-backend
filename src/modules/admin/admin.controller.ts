import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('metrics')
  @UseGuards(JwtAuthGuard)
  async getMetrics() {
    // TODO: admin only, return KPI data
  }

  @Get('listings/pending')
  @UseGuards(JwtAuthGuard)
  async getPendingListings() {
    // TODO: admin only
  }

  @Patch('listings/:id/approve')
  @UseGuards(JwtAuthGuard)
  async approveListing(@Param('id') id: string) {
    // TODO: admin only
  }
}

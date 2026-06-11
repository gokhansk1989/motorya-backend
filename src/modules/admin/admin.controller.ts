import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminService } from './admin.service';
import { ModerateListingDto, ModerateUserDto } from './dto/admin.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('admin')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('metrics')
  getMetrics() {
    return this.adminService.getMetrics();
  }

  @Get('listings/pending')
  getPendingListings(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getPendingListings(Number(page) || 1, Number(limit) || 20);
  }

  @Patch('listings/:id/moderate')
  moderateListing(
    @Param('id') id: string,
    @Request() req,
    @Body() dto: ModerateListingDto,
  ) {
    return this.adminService.moderateListing(id, req.user.id, dto);
  }

  @Get('users')
  getUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.getUsers(Number(page) || 1, Number(limit) || 20, search);
  }

  @Patch('users/:id/moderate')
  moderateUser(
    @Param('id') id: string,
    @Request() req,
    @Body() dto: ModerateUserDto,
  ) {
    return this.adminService.moderateUser(id, req.user.id, dto);
  }

  @Get('audit-log')
  getAuditLog(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getAuditLog(Number(page) || 1, Number(limit) || 50);
  }
}

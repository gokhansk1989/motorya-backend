import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminService } from './admin.service';
import { ModerateListingDto, ModerateUserDto } from './dto/admin.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MessagesService } from '../messages/messages.service';

@Controller('admin')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
export class AdminController {
  constructor(
    private adminService: AdminService,
    private messagesService: MessagesService,
  ) {}

  @Get('metrics')
  getMetrics() {
    return this.adminService.getMetrics();
  }

  @Get('notifications/summary')
  getNotificationSummary() {
    return this.adminService.getNotificationSummary();
  }

  @Get('metrics/listings-trend')
  getListingsTrend(@Query('days') days?: string) {
    return this.adminService.getListingsTrend(Number(days) || 7);
  }

  @Get('listings/pending')
  getPendingListings(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getPendingListings(Number(page) || 1, Number(limit) || 20);
  }

  @Get('listings')
  getAllListings(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.getAllListings(Number(page) || 1, Number(limit) || 20, status, search);
  }

  @Patch('listings/:id/moderate')
  moderateListing(
    @Param('id') id: string,
    @Request() req,
    @Body() dto: ModerateListingDto,
  ) {
    return this.adminService.moderateListing(id, req.user.id, dto);
  }

  @Delete('listings/:id')
  @HttpCode(HttpStatus.OK)
  deleteListing(@Param('id') id: string, @Request() req) {
    return this.adminService.deleteListing(id, req.user.id);
  }

  @Get('users')
  getUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.getUsers(Number(page) || 1, Number(limit) || 20, search);
  }

  @Patch('users/:id/role')
  @Roles('SUPER_ADMIN')
  changeUserRole(
    @Param('id') id: string,
    @Request() req,
    @Body('role') role: string,
  ) {
    return this.adminService.changeUserRole(id, req.user.id, role);
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

  @Get('reports')
  getReports(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.getReports(Number(page) || 1, Number(limit) || 20, status);
  }

  @Patch('reports/:id/status')
  updateReportStatus(
    @Param('id') id: string,
    @Request() req,
    @Body('status') status: string,
    @Body('note') note?: string,
  ) {
    return this.adminService.updateReportStatus(id, req.user.id, status, note);
  }

  // Dispute için konuşma mesajlarını şifresiz oku (SUPER_ADMIN only, audit log düşer)
  @Get('conversations/:id/messages')
  @Roles('SUPER_ADMIN')
  getConversationMessages(
    @Param('id') id: string,
    @Request() req,
    @Query('reason') reason: string,
  ) {
    return this.messagesService.getMessagesForAdmin(req.user.id, id, reason || 'admin_review');
  }
}

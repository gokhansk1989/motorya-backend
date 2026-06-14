import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import { UpdateProfileDto, ChangePasswordDto } from './dto/users.dto';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  getMe(@Request() req) {
    return this.usersService.getProfile(req.user.id);
  }

  @Patch('me')
  @UseGuards(AuthGuard('jwt'))
  updateMe(@Request() req, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(req.user.id, dto);
  }

  @Patch('me/password')
  @UseGuards(AuthGuard('jwt'))
  changePassword(@Request() req, @Body() dto: ChangePasswordDto) {
    return this.usersService.changePassword(req.user.id, dto);
  }

  @Get('me/notifications')
  @UseGuards(AuthGuard('jwt'))
  getNotifications(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.usersService.getNotifications(req.user.id, Number(page) || 1, Number(limit) || 20);
  }

  @Post('me/notifications/read')
  @UseGuards(AuthGuard('jwt'))
  markRead(@Request() req, @Body('ids') ids?: string[]) {
    return this.usersService.markNotificationsRead(req.user.id, ids);
  }

  @Patch('me/vacation')
  @UseGuards(AuthGuard('jwt'))
  setVacation(@Request() req, @Body('enabled') enabled: boolean) {
    return this.usersService.setVacationMode(req.user.id, enabled);
  }

  @Get(':id')
  getPublic(@Param('id') id: string) {
    return this.usersService.getPublicProfile(id);
  }
}

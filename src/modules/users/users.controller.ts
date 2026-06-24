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
import { OptionalJwtGuard } from '../../common/guards/optional-jwt.guard';
import { UsersService } from './users.service';
import { WebPushService } from './webpush.service';
import { UpdateProfileDto, ChangePasswordDto } from './dto/users.dto';

@Controller('users')
export class UsersController {
  constructor(
    private usersService: UsersService,
    private webPush: WebPushService,
  ) {}

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
    return this.usersService.changePassword(req.user.id, dto, req.ip, req.headers['user-agent']);
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

  @Get('push/vapid-public-key')
  getVapidKey() {
    return { key: this.webPush.getPublicKey() };
  }

  @Post('me/push-subscription')
  @UseGuards(AuthGuard('jwt'))
  subscribePush(@Request() req, @Body() body: { endpoint: string; p256dh: string; auth: string }) {
    return this.webPush.subscribe(req.user.id, body);
  }

  @Post('me/push-unsubscribe')
  @UseGuards(AuthGuard('jwt'))
  unsubscribePush(@Body('endpoint') endpoint: string) {
    return this.webPush.unsubscribe(endpoint);
  }

  @Get(':id')
  @UseGuards(OptionalJwtGuard)
  getPublic(@Param('id') id: string, @Request() req) {
    return this.usersService.getPublicProfile(id, req.user?.id);
  }
}

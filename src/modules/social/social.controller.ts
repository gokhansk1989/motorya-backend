import { Controller, Post, Delete, Get, Param, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SocialService } from './social.service';
import { OptionalJwtGuard } from '../../common/guards/optional-jwt.guard';

@Controller('users')
export class SocialController {
  constructor(private social: SocialService) {}

  @Post(':id/follow')
  @UseGuards(AuthGuard('jwt'))
  follow(@Request() req: any, @Param('id') id: string) {
    return this.social.toggleFollow(req.user.id, id);
  }

  @Post(':id/block')
  @UseGuards(AuthGuard('jwt'))
  block(@Request() req: any, @Param('id') id: string) {
    return this.social.toggleBlock(req.user.id, id);
  }

  @Get(':id/relation')
  @UseGuards(OptionalJwtGuard)
  relation(@Request() req: any, @Param('id') id: string) {
    if (!req.user) return { isFollowing: false, isBlocked: false, isFollowedBy: false, isBlockedBy: false };
    return this.social.getRelationStatus(req.user.id, id);
  }

  @Get('me/following')
  @UseGuards(AuthGuard('jwt'))
  following(@Request() req: any) {
    return this.social.getFollowing(req.user.id);
  }

  @Get('me/blocked')
  @UseGuards(AuthGuard('jwt'))
  blocked(@Request() req: any) {
    return this.social.getBlocked(req.user.id);
  }
}

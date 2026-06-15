import { Controller, Get, Post, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';

class StartConversationDto {
  @IsString() otherUserId: string;
  @IsOptional() @IsString() listingId?: string;
}

class SendMessageDto {
  @IsString() @MinLength(1) @MaxLength(2000) body: string;
}

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private messages: MessagesService) {}

  @Post('conversations')
  startConversation(@Request() req: any, @Body() dto: StartConversationDto) {
    return this.messages.getOrCreateConversation(req.user.sub, dto.otherUserId, dto.listingId);
  }

  @Get('conversations')
  getConversations(@Request() req: any) {
    return this.messages.getConversations(req.user.sub);
  }

  @Get('conversations/:id')
  getMessages(
    @Request() req: any,
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.messages.getMessages(req.user.sub, id, cursor, limit ? parseInt(limit) : 30);
  }

  @Post('conversations/:id')
  sendMessage(@Request() req: any, @Param('id') id: string, @Body() dto: SendMessageDto) {
    return this.messages.sendMessage(req.user.sub, id, dto.body);
  }

  @Post('conversations/:id/read')
  markRead(@Request() req: any, @Param('id') id: string) {
    return this.messages.markRead(req.user.sub, id);
  }
}

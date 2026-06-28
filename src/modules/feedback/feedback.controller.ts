import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto, UpdateFeedbackStatusDto } from './dto/feedback.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

// Public — kullanıcılar (giriş yapmış ya da yapmamış) serbest metin geri bildirim gönderebilir.
@Controller('feedback')
export class FeedbackController {
  constructor(private feedback: FeedbackService) {}

  @Post()
  async create(@Body() dto: CreateFeedbackDto, @Req() req: Request) {
    const userId = (req as any).user?.id ?? null;
    await this.feedback.create({
      message: dto.message,
      page: dto.page,
      contactEmail: dto.contactEmail,
      userId,
    });
    return { ok: true };
  }
}

@Controller('admin/feedback')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
export class AdminFeedbackController {
  constructor(private feedback: FeedbackService) {}

  @Get()
  list(@Query('status') status?: string, @Query('page') page = '1', @Query('limit') limit = '30') {
    return this.feedback.findMany({ status, page: Number(page) || 1, limit: Math.min(Number(limit) || 30, 100) });
  }

  @Get('summary')
  summary() {
    return this.feedback.getSummary();
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateFeedbackStatusDto) {
    return this.feedback.updateStatus(id, dto.status);
  }
}

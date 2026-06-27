import { Body, Controller, Delete, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { ErrorLogsService } from './error-logs.service';
import { CreateErrorLogDto } from './dto/error-logs.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

// Public — frontend/admin'de yakalanan client-side hatalar buraya gönderilir.
// Auth gerektirmez: login ekranındaki bir hata da (kullanıcı henüz giriş yapmamış) loglanabilmeli.
@Controller('error-logs')
export class ErrorLogsController {
  constructor(private errorLogs: ErrorLogsService) {}

  @Post()
  async create(@Body() dto: CreateErrorLogDto, @Req() req: Request) {
    const userId = (req as any).user?.id ?? null;
    await this.errorLogs.log({
      source: dto.source,
      message: dto.message,
      stack: dto.stack,
      path: dto.path,
      userId,
      context: dto.context,
    });
    return { ok: true };
  }
}

@Controller('admin/error-logs')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
export class AdminErrorLogsController {
  constructor(private errorLogs: ErrorLogsService) {}

  @Get()
  list(@Query('source') source?: string, @Query('q') q?: string, @Query('page') page = '1', @Query('limit') limit = '30') {
    return this.errorLogs.findMany({ source, q, page: Number(page) || 1, limit: Math.min(Number(limit) || 30, 100) });
  }

  @Get('summary')
  summary() {
    return this.errorLogs.getSummary();
  }

  @Delete()
  @Roles('SUPER_ADMIN')
  clear() {
    return this.errorLogs.clearAll();
  }
}

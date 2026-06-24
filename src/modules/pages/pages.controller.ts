import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { PagesService } from './pages.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateStaticPageDto, UpdateStaticPageDto } from './dto/pages.dto';

@Controller('pages')
export class PagesController {
  constructor(private pages: PagesService) {}

  // Admin routes — before :slug
  @Get('admin/list')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  adminList() {
    return this.pages.adminList();
  }

  @Get('admin/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  adminGet(@Param('id') id: string) {
    return this.pages.adminGet(id);
  }

  @Post('admin')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  create(@Body() body: CreateStaticPageDto) {
    return this.pages.create(body);
  }

  @Put('admin/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(@Param('id') id: string, @Body() body: UpdateStaticPageDto) {
    return this.pages.update(id, body);
  }

  @Delete('admin/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Param('id') id: string) {
    return this.pages.remove(id);
  }

  // Public
  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.pages.getBySlug(slug);
  }
}

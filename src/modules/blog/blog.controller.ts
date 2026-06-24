import {
  Controller, Get, Post, Put, Delete, Param, Body, Query,
  UseGuards, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { BlogService } from './blog.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateBlogPostDto, UpdateBlogPostDto } from './dto/blog.dto';

@Controller('blog')
export class BlogController {
  constructor(private blog: BlogService) {}

  // Admin routes — must come before :slug to avoid route conflict
  @Get('admin/list')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'MODERATOR')
  adminList(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.blog.adminList(page, Math.min(limit, 50));
  }

  @Get('admin/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'MODERATOR')
  adminGet(@Param('id') id: string) {
    return this.blog.adminGet(id);
  }

  @Post('admin')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'MODERATOR')
  create(@Body() body: CreateBlogPostDto) {
    return this.blog.create(body);
  }

  @Put('admin/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'MODERATOR')
  update(@Param('id') id: string, @Body() body: UpdateBlogPostDto) {
    return this.blog.update(id, body);
  }

  @Delete('admin/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'MODERATOR')
  remove(@Param('id') id: string) {
    return this.blog.remove(id);
  }

  // Public routes
  @Get()
  list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('category') category?: string,
  ) {
    return this.blog.listPublic(page, Math.min(limit, 50), category);
  }

  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.blog.getBySlug(slug);
  }
}

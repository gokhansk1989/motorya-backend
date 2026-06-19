import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OptionalJwtGuard } from '../../common/guards/optional-jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ListingsService } from './listings.service';
import { CreateListingDto, UpdateListingDto, ListingsQueryDto } from './dto/listings.dto';

@Controller('listings')
export class ListingsController {
  constructor(private listingsService: ListingsService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  create(@Request() req, @Body() dto: CreateListingDto) {
    return this.listingsService.createListing(req.user.id, dto);
  }

  @Get('meta/categories')
  getCategories() {
    return this.listingsService.getCategories();
  }

  @Get('meta/brands')
  getBrands() {
    return this.listingsService.getBrands();
  }

  @Get('meta/category/:slug')
  getCategoryBySlug(@Param('slug') slug: string) {
    return this.listingsService.getCategoryBySlug(slug);
  }

  // ── Admin: Category CRUD ─────────────────────────────────────────────────
  @Post('admin/categories')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  adminCreateCategory(@Body() body: { name: string; slug: string; parentId?: string; sortOrder?: number }) {
    return this.listingsService.adminCreateCategory(body);
  }

  @Put('admin/categories/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  adminUpdateCategory(@Param('id') id: string, @Body() body: { name?: string; slug?: string; parentId?: string; sortOrder?: number; isActive?: boolean }) {
    return this.listingsService.adminUpdateCategory(id, body);
  }

  @Delete('admin/categories/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  adminDeleteCategory(@Param('id') id: string) {
    return this.listingsService.adminDeleteCategory(id);
  }

  // ── Admin: Brand CRUD ────────────────────────────────────────────────────
  @Post('admin/brands')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  adminCreateBrand(@Body() body: { name: string; slug: string; logoUrl?: string }) {
    return this.listingsService.adminCreateBrand(body);
  }

  @Put('admin/brands/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  adminUpdateBrand(@Param('id') id: string, @Body() body: { name?: string; slug?: string; logoUrl?: string }) {
    return this.listingsService.adminUpdateBrand(id, body);
  }

  @Delete('admin/brands/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  adminDeleteBrand(@Param('id') id: string) {
    return this.listingsService.adminDeleteBrand(id);
  }

  @Get()
  @UseGuards(OptionalJwtGuard)
  findAll(@Query() query: ListingsQueryDto, @Request() req) {
    return this.listingsService.getListings(query, req.user?.id);
  }

  @Get('mine')
  @UseGuards(AuthGuard('jwt'))
  findMine(@Request() req, @Query('status') status?: string) {
    return this.listingsService.getMyListings(req.user.id, status as any);
  }

  @Get('by-ids')
  findByIds(@Query('ids') ids: string) {
    const idList = (ids || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50);
    return this.listingsService.getListingsByIds(idList);
  }

  @Get('by-slug')
  @UseGuards(OptionalJwtGuard)
  findBySlug(@Query('s') slug: string, @Request() req) {
    return this.listingsService.getListingBySlug(slug, req.user?.id);
  }

  @Get(':id')
  @UseGuards(OptionalJwtGuard)
  findOne(@Param('id') id: string, @Request() req) {
    return this.listingsService.getListingById(id, req.user?.id);
  }

  @Get(':id/similar')
  findSimilar(@Param('id') id: string) {
    return this.listingsService.getSimilarListings(id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  update(@Param('id') id: string, @Request() req, @Body() dto: UpdateListingDto) {
    return this.listingsService.updateListing(id, req.user.id, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string, @Request() req) {
    return this.listingsService.deleteListing(id, req.user.id);
  }

  @Patch(':id/toggle-status')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  toggleStatus(@Param('id') id: string, @Request() req) {
    return this.listingsService.toggleListingStatus(id, req.user.id);
  }

  @Post(':id/favorite')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  toggleFavorite(@Param('id') id: string, @Request() req) {
    return this.listingsService.toggleFavorite(req.user.id, id);
  }

  @Get('favorites/mine')
  @UseGuards(AuthGuard('jwt'))
  getFavorites(@Request() req) {
    return this.listingsService.getMyFavorites(req.user.id);
  }

  @Post(':id/report')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  reportListing(
    @Param('id') id: string,
    @Request() req,
    @Body('reason') reason: string,
    @Body('description') description?: string,
  ) {
    return this.listingsService.reportListing(req.user.id, id, reason, description);
  }

  @Patch(':id/sold')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  markSold(@Param('id') id: string, @Request() req) {
    return this.listingsService.markSold(req.user.id, id);
  }

  @Patch(':id/reserve')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  reserve(@Param('id') id: string, @Request() req) {
    return this.listingsService.reserveListing(req.user.id, id);
  }

  @Patch(':id/unreserve')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  unreserve(@Param('id') id: string, @Request() req) {
    return this.listingsService.unreserveListing(req.user.id, id);
  }
}

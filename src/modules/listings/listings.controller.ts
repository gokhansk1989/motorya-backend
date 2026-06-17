import {
  Controller,
  Get,
  Post,
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
}

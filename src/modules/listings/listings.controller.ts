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

  @Get()
  findAll(@Query() query: ListingsQueryDto) {
    return this.listingsService.getListings(query);
  }

  @Get('mine')
  @UseGuards(AuthGuard('jwt'))
  findMine(@Request() req, @Query('status') status?: string) {
    return this.listingsService.getMyListings(req.user.id, status as any);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.listingsService.getListingById(id, req.user?.id);
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
}

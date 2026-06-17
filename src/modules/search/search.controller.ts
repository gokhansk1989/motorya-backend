import { Controller, Get, Post, UseGuards, Query, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { OptionalJwtGuard } from '../../common/guards/optional-jwt.guard';
import { ListingsService } from '../listings/listings.service';
import { SearchService } from './search.service';
import { SocialService } from '../social/social.service';
import { IsOptional, IsString, IsNumber, IsPositive, IsInt, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

class SearchQueryDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() brandId?: string;
  @IsOptional() @IsString() condition?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @IsPositive() minPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @IsPositive() maxPrice?: number;
  @IsOptional() @IsEnum(['newest', 'oldest', 'price_asc', 'price_desc']) sort?: string = 'newest';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number = 20;
}

@Controller('search')
export class SearchController {
  constructor(
    private searchService: SearchService,
    private listingsService: ListingsService,
    private socialService: SocialService,
  ) {}

  @Get()
  @UseGuards(OptionalJwtGuard)
  async search(@Query() query: SearchQueryDto, @Request() req) {
    let excludeSellerIds: string[] = [];
    if (req.user?.id) {
      excludeSellerIds = await this.socialService.getBlockedUserIds(req.user.id).catch(() => []);
    }
    return this.searchService.search({ ...query, excludeSellerIds });
  }

  @Post('reindex')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  reindex() {
    return this.listingsService.reindexAll();
  }
}

import { Controller, Get, Post, UseGuards, Query, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { OptionalJwtGuard } from '../../common/guards/optional-jwt.guard';
import { ListingsService } from '../listings/listings.service';
import { SearchService } from './search.service';
import { SocialService } from '../social/social.service';
import { IsOptional, IsString, IsNumber, IsPositive, IsInt, Min, Max, IsEnum, Matches, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

// Kimlikler cuid ya da uuid; sehir ve beden kisa serbest metin ama filtre
// diline girdikleri icin tirnak ve ters bolu gibi denetim karakterlerini
// disarida birakiyoruz. Kacirma zaten search.service tarafinda yapiliyor;
// bu ikinci katman, ileride yeni bir filtre eklenirken ayni hatanin
// tekrarlanmasini zorlastiriyor.
const KIMLIK = /^[A-Za-z0-9_-]{1,40}$/;
const METIN = /^[\p{L}\p{N} .,'’()\/-]{1,60}$/u;

class SearchQueryDto {
  @IsOptional() @IsString() @MaxLength(200) q?: string;
  @IsOptional() @IsString() @Matches(KIMLIK) categoryId?: string;
  @IsOptional() @IsString() @Matches(KIMLIK) brandId?: string;
  @IsOptional() @IsEnum(['NEW', 'LIKE_NEW', 'GOOD', 'FAIR']) condition?: string;
  @IsOptional() @IsString() @Matches(METIN) city?: string;
  @IsOptional() @IsString() @Matches(METIN) sizeLabel?: string;
  @IsOptional() @IsEnum(['ERKEK', 'KADIN', 'UNISEX', 'COCUK']) gender?: string;
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
  @Roles('ADMIN', 'SUPER_ADMIN')
  reindex() {
    return this.listingsService.reindexAll();
  }
}

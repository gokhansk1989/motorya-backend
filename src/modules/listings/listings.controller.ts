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
import { Throttle } from '@nestjs/throttler';
import { OptionalJwtGuard } from '../../common/guards/optional-jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ListingsService } from './listings.service';
import { CreateListingDto, UpdateListingDto, ListingsQueryDto, TaslakDto, TestIsaretiDto, BekleyenDuzenlemeDto } from './dto/listings.dto';
import { TaslakService } from './taslak.service';
import { CreateCategoryDto, UpdateCategoryDto, CreateBrandDto, UpdateBrandDto, SetFeaturedDto, VitrinSirasiDto } from './dto/admin-category.dto';

@Controller('listings')
export class ListingsController {
  constructor(
    private listingsService: ListingsService,
    private taslak: TaslakService,
  ) {}

  // Global sınır (100/dk) ilan spam'i için fazla gevşek: tek hesap dakikalar
  // içinde moderasyon kuyruğunu boğabilir. Gerçek kullanıcı saatte 10 ilandan
  // fazlasını elle giremez.
  @Post()
  @UseGuards(AuthGuard('jwt'))
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  create(@Request() req, @Body() dto: CreateListingDto) {
    return this.listingsService.createListing(req.user.id, dto);
  }

  @Get('meta/categories')
  getCategories() {
    return this.listingsService.getCategories();
  }

  // ── Taslak ────────────────────────────────────────────────────────
  // Taslak kullaniciya ait: userId jetondan geliyor, istekten DEGIL.
  // Boylece baska bir hesabin taslagi okunamiyor ve cikis yapildiginda
  // taslak baska hesapta gorunmuyor.
  @Get('taslak')
  @UseGuards(AuthGuard('jwt'))
  taslakGetir(@Request() req) {
    return this.taslak.getir(req.user.id);
  }

  @Put('taslak')
  @UseGuards(AuthGuard('jwt'))
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  taslakKaydet(@Request() req, @Body() dto: TaslakDto) {
    return this.taslak.kaydet(req.user.id, dto);
  }

  @Delete('taslak')
  @UseGuards(AuthGuard('jwt'))
  taslakSil(@Request() req) {
    return this.taslak.sil(req.user.id);
  }

  // ── Bekleyen icerik duzenlemeleri (moderator) ─────────────────────
  @Get('admin/bekleyen-duzenlemeler')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  bekleyenDuzenlemeler() {
    return this.listingsService.bekleyenDuzenlemeler();
  }

  @Post('admin/:id/duzenleme/onayla')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  duzenlemeyiOnayla(@Param('id') id: string, @Body() dto: BekleyenDuzenlemeDto, @Request() req) {
    return this.listingsService.bekleyenDuzenlemeyiOnayla(id, req.user.id, dto?.beklenenSurum);
  }

  @Post('admin/:id/duzenleme/reddet')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  duzenlemeyiReddet(@Param('id') id: string, @Body() dto: BekleyenDuzenlemeDto, @Request() req) {
    return this.listingsService.bekleyenDuzenlemeyiReddet(id, req.user.id, dto?.nedenKodu);
  }

  // ── Vitrin yonetimi ──────────────────────────────────────────────
  // Sabit yollar `admin/:id` kalibindan ONCE tanimlanmali; aksi halde
  // Nest "vitrin" kelimesini bir ilan ID'si sanar.
  @Get('admin/vitrin')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  vitrinOzeti() {
    return this.listingsService.vitrinOzeti();
  }

  // Sira ucu ayri: `feature` uzerinden kaydetmek vitrin suresini de
  // uzatirdi (bkz. vitrinSirasiniKaydet).
  @Patch('admin/vitrin-sirasi')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  vitrinSirasi(@Request() req: any, @Body() dto: VitrinSirasiDto) {
    return this.listingsService.vitrinSirasiniKaydet(dto.sira, req.user?.id);
  }

  @Get('admin/vitrin-adaylari')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  vitrinAdaylari(@Query('search') search?: string) {
    return this.listingsService.vitrinAdaylari(search);
  }

  // ── Test isareti ──────────────────────────────────────────────────
  // SUPER_ADMIN'e kisitli: isaret bir kaydi genel listelerden ve
  // raporlardan cikardigi icin yanlislikla kullanilmasi, gercek bir
  // ilani sessizce gizlemek demek olurdu.
  @Get('admin/test-kayitlari')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  testKayitlari() {
    return this.listingsService.testKayitlari();
  }

  @Put('admin/:id/test-isareti')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN')
  testIsareti(@Param('id') id: string, @Body() dto: TestIsaretiDto, @Request() req) {
    return this.listingsService.testIsaretiAyarla(id, dto.isTest, req.user.id);
  }

  @Put('admin/kullanici/:id/test-hesabi')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN')
  testHesabi(@Param('id') id: string, @Body() dto: TestIsaretiDto, @Request() req) {
    return this.listingsService.testHesabiAyarla(id, dto.isTest, req.user.id);
  }

  @Get('meta/brands')
  // categoryId verilmezse davranis AYNI: tum markalar, duz liste. Verilirse
  // liste yine TAM donuyor, her markaya "oncelikli" bayragi ekleniyor.
  // Boylece mevcut cagiranlar (ana sayfa, baslik, duzenleme) degismiyor.
  getBrands(@Query('categoryId') categoryId?: string) {
    return this.listingsService.getBrands(categoryId);
  }

  @Get('meta/facets')
  getFacets(@Query('categorySlug') categorySlug?: string) {
    return this.listingsService.getFacets(categorySlug);
  }

  @Get('meta/category/:slug')
  getCategoryBySlug(@Param('slug') slug: string) {
    return this.listingsService.getCategoryBySlug(slug);
  }

  @Get('meta/brands-by-category/:categorySlug')
  getBrandsByCategory(@Param('categorySlug') categorySlug: string) {
    return this.listingsService.getBrandsByCategory(categorySlug);
  }

  // ── Admin: Category CRUD ─────────────────────────────────────────────────
  @Get('admin/categories')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  adminGetCategories() {
    return this.listingsService.adminGetCategories();
  }

  @Post('admin/categories')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  adminCreateCategory(@Body() body: CreateCategoryDto) {
    return this.listingsService.adminCreateCategory(body);
  }

  @Put('admin/categories/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  adminUpdateCategory(@Param('id') id: string, @Body() body: UpdateCategoryDto) {
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
  adminCreateBrand(@Body() body: CreateBrandDto) {
    return this.listingsService.adminCreateBrand(body);
  }

  @Put('admin/brands/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  adminUpdateBrand(@Param('id') id: string, @Body() body: UpdateBrandDto) {
    return this.listingsService.adminUpdateBrand(id, body);
  }

  @Delete('admin/brands/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  adminDeleteBrand(@Param('id') id: string) {
    return this.listingsService.adminDeleteBrand(id);
  }

  @Patch('admin/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  adminUpdateListing(@Param('id') id: string, @Body() dto: UpdateListingDto) {
    return this.listingsService.adminUpdateListing(id, dto);
  }

  @Patch('admin/:id/feature')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  adminSetFeatured(@Param('id') id: string, @Body() dto: SetFeaturedDto, @Request() req) {
    return this.listingsService.adminSetFeatured(id, dto, req.user.id);
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

  @Get('price-guide')
  getPriceGuide(@Query('categoryId') categoryId: string, @Query('brandId') brandId?: string) {
    return this.listingsService.getPriceGuide(categoryId, brandId);
  }

  @Get('price-drops')
  getPriceDrops(@Query('limit') limit?: string) {
    return this.listingsService.getPriceDrops(limit ? Number(limit) : 12);
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

  // Satıcının "satıldı" ekranında alıcıyı seçebilmesi için aday listesi
  @Get(':id/buyer-candidates')
  @UseGuards(AuthGuard('jwt'))
  getBuyerCandidates(@Param('id') id: string, @Request() req) {
    return this.listingsService.getBuyerCandidates(req.user.id, id);
  }

  // Alici onayi: saticinin "satildi" beyanini iki tarafli hale getirir.
  @Patch(':id/alisverisi-onayla')
  @UseGuards(AuthGuard('jwt'))
  alisverisiOnayla(@Param('id') id: string, @Request() req) {
    return this.listingsService.alisverisiOnayla(id, req.user.id);
  }

  @Patch(':id/sold')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  markSold(@Param('id') id: string, @Request() req, @Body() body?: { buyerId?: string }) {
    return this.listingsService.markSold(req.user.id, id, body?.buyerId);
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

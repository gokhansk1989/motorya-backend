import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SavedSearchService } from './saved-search.service';
import { CreateSavedSearchDto } from './dto/saved-search.dto';

@Controller('saved-searches')
@UseGuards(AuthGuard('jwt'))
export class SavedSearchController {
  constructor(private savedSearchService: SavedSearchService) {}

  @Post()
  create(@Request() req, @Body() dto: CreateSavedSearchDto) {
    return this.savedSearchService.create(req.user.id, dto);
  }

  @Get()
  getMine(@Request() req) {
    return this.savedSearchService.getMine(req.user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Request() req, @Param('id') id: string) {
    return this.savedSearchService.remove(req.user.id, id);
  }
}

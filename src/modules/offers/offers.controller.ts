import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OffersService } from './offers.service';
import { CreateOfferDto, RespondOfferDto, CounterOfferDto } from './dto/offers.dto';

@Controller('offers')
@UseGuards(AuthGuard('jwt'))
export class OffersController {
  constructor(private offersService: OffersService) {}

  @Post()
  create(@Request() req, @Body() dto: CreateOfferDto) {
    return this.offersService.createOffer(req.user.id, dto);
  }

  @Get('mine')
  getMine(@Request() req) {
    return this.offersService.getMyOffers(req.user.id);
  }

  @Get('received')
  getReceived(@Request() req) {
    return this.offersService.getReceivedOffers(req.user.id);
  }

  @Get('listing/:listingId')
  getForListing(@Param('listingId') listingId: string, @Request() req) {
    return this.offersService.getOffersForListing(listingId, req.user.id);
  }

  @Patch(':id/respond')
  respond(@Param('id') id: string, @Request() req, @Body() dto: RespondOfferDto) {
    return this.offersService.respondOffer(id, req.user.id, dto);
  }

  @Patch(':id/counter')
  counter(@Param('id') id: string, @Request() req, @Body() dto: CounterOfferDto) {
    return this.offersService.counterOffer(id, req.user.id, dto);
  }

  @Patch(':id/respond-counter')
  respondCounter(@Param('id') id: string, @Request() req, @Body('action') action: 'ACCEPTED' | 'REJECTED') {
    return this.offersService.respondCounterOffer(id, req.user.id, action);
  }

  @Delete(':id')
  withdraw(@Param('id') id: string, @Request() req) {
    return this.offersService.withdrawOffer(id, req.user.id);
  }
}

import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/reviews.dto';
import { ReviewDirection } from '@prisma/client';

@Controller('reviews')
export class ReviewsController {
  constructor(private reviewsService: ReviewsService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  create(@Request() req, @Body() dto: CreateReviewDto) {
    return this.reviewsService.createReview(req.user.id, dto);
  }

  @Get('user/:userId')
  getForUser(
    @Param('userId') userId: string,
    @Query('direction') direction?: ReviewDirection,
  ) {
    return this.reviewsService.getReviewsForUser(userId, direction);
  }

  @Get('listing/:listingId')
  getForListing(@Param('listingId') listingId: string) {
    return this.reviewsService.getReviewsForListing(listingId);
  }
}

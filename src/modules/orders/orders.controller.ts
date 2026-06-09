import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrderStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

@Controller('orders')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async createOrder(
    @Request() req,
    @Body()
    dto: {
      listingId: string;
      sellerId: string;
      amount: string;
      commissionRate?: string;
    },
  ) {
    return this.ordersService.createOrder({
      listingId: dto.listingId,
      buyerId: req.user.id,
      sellerId: dto.sellerId,
      amount: new Decimal(dto.amount),
      commissionRate: dto.commissionRate
        ? new Decimal(dto.commissionRate)
        : undefined,
    });
  }

  @Patch(':id/transition')
  @UseGuards(JwtAuthGuard)
  async transitionOrder(
    @Param('id') orderId: string,
    @Body() dto: { status: OrderStatus; trackingNo?: string; reason?: string },
  ) {
    return this.ordersService.transitionOrder(orderId, dto.status, {
      trackingNo: dto.trackingNo,
      reason: dto.reason,
    });
  }

  @Post(':id/dispute')
  @UseGuards(JwtAuthGuard)
  async openDispute(
    @Param('id') orderId: string,
    @Request() req,
    @Body() dto: { reason: string },
  ) {
    return this.ordersService.openDispute(orderId, req.user.id, dto.reason);
  }
}

import { Controller, Post, Body } from '@nestjs/common';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post('webhook/iyzico')
  async handleIyzicoWebhook(@Body() data: any) {
    console.log('Webhook from iyzico:', data);
    // TODO: Parse & handle payment status
  }

  @Post('webhook/paytr')
  async handlePaytrWebhook(@Body() data: any) {
    console.log('Webhook from PayTR:', data);
    // TODO: Parse & handle payment status
  }
}

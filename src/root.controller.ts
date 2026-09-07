import { Controller, Get } from '@nestjs/common';

@Controller()
export class RootController {
  @Get()
  root() {
    return {
      service: 'motorya-api',
      status: 'ok',
      docs: 'https://api.motorya.com.tr/docs',
      health: 'https://api.motorya.com.tr/health',
    };
  }
}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ErrorLogsService } from './error-logs.service';
import { ErrorLogsController, AdminErrorLogsController } from './error-logs.controller';
import { AllExceptionsFilter } from './all-exceptions.filter';

@Module({
  imports: [PrismaModule],
  controllers: [ErrorLogsController, AdminErrorLogsController],
  providers: [ErrorLogsService, AllExceptionsFilter],
  exports: [ErrorLogsService, AllExceptionsFilter],
})
export class ErrorLogsModule {}

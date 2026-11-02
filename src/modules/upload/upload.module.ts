import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { ErrorLogsModule } from '../error-logs/error-logs.module';

@Module({
  imports: [ErrorLogsModule],
  controllers: [UploadController],
})
export class UploadModule {}

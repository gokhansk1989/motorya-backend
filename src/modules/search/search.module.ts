import { Module, forwardRef } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { ListingsModule } from '../listings/listings.module';
import { SocialModule } from '../social/social.module';
import { ErrorLogsModule } from '../error-logs/error-logs.module';

@Module({
  imports: [forwardRef(() => ListingsModule), SocialModule, ErrorLogsModule],
  providers: [SearchService],
  controllers: [SearchController],
  exports: [SearchService],
})
export class SearchModule {}

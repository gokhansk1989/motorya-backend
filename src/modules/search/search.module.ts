import { Module, forwardRef } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { ListingsModule } from '../listings/listings.module';
import { SocialModule } from '../social/social.module';

@Module({
  imports: [forwardRef(() => ListingsModule), SocialModule],
  providers: [SearchService],
  controllers: [SearchController],
  exports: [SearchService],
})
export class SearchModule {}

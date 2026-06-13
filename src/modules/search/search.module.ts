import { Module, forwardRef } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { ListingsModule } from '../listings/listings.module';

@Module({
  imports: [forwardRef(() => ListingsModule)],
  providers: [SearchService],
  controllers: [SearchController],
  exports: [SearchService],
})
export class SearchModule {}

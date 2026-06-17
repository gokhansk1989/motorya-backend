import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Meilisearch } = require('meilisearch');
type MeiliSearch = InstanceType<typeof Meilisearch>;
type Index = ReturnType<MeiliSearch['index']>;

export interface ListingDocument {
  id: string;
  title: string;
  description: string;
  price: number;
  originalPrice?: number;
  condition: string;
  city?: string;
  sizeLabel?: string;
  categoryId: string;
  categoryName: string;
  brandId?: string;
  brandName?: string;
  sellerId: string;
  sellerName: string;
  imageUrl?: string;
  status: string;
  createdAt: number; // unix timestamp for sorting
}

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);
  private client: MeiliSearch;
  private index: Index;

  constructor(private config: ConfigService) {
    this.client = new Meilisearch({
      host: this.config.get('MEILI_HOST', 'http://localhost:7700'),
      apiKey: this.config.get('MEILI_MASTER_KEY', 'meili-dev-key'),
    });
  }

  async onModuleInit() {
    try {
      await this.client.createIndex('listings', { primaryKey: 'id' }).catch(() => {});
      this.index = this.client.index('listings');
      await this.index.updateSettings({
        searchableAttributes: ['title', 'description', 'categoryName', 'brandName', 'city'],
        filterableAttributes: ['categoryId', 'brandId', 'condition', 'city', 'price', 'status', 'sellerId'],
        sortableAttributes: ['price', 'createdAt'],
        displayedAttributes: [
          'id', 'title', 'price', 'originalPrice', 'condition', 'city', 'sizeLabel',
          'categoryId', 'categoryName', 'brandId', 'brandName', 'sellerId', 'sellerName',
          'imageUrl', 'status', 'createdAt',
        ],
      });
      this.logger.log('Meilisearch index configured');
    } catch (err) {
      this.logger.warn(`Meilisearch unavailable: ${err.message}`);
    }
  }

  async indexListing(doc: ListingDocument) {
    try {
      await this.index.addDocuments([doc], { primaryKey: 'id' });
    } catch (err) {
      this.logger.warn(`Failed to index listing ${doc.id}: ${err.message}`);
    }
  }

  async removeListing(id: string) {
    try {
      await this.index.deleteDocument(id);
    } catch (err) {
      this.logger.warn(`Failed to remove listing ${id} from index: ${err.message}`);
    }
  }

  async search(params: {
    q?: string;
    categoryId?: string;
    brandId?: string;
    condition?: string;
    city?: string;
    minPrice?: number;
    maxPrice?: number;
    sort?: string;
    page?: number;
    limit?: number;
    excludeSellerIds?: string[];
  }) {
    const {
      q = '',
      categoryId,
      brandId,
      condition,
      city,
      minPrice,
      maxPrice,
      sort = 'newest',
      page = 1,
      limit = 20,
      excludeSellerIds,
    } = params;

    const filters: string[] = ['status = "ACTIVE"'];
    if (categoryId) filters.push(`categoryId = "${categoryId}"`);
    if (brandId) filters.push(`brandId = "${brandId}"`);
    if (condition) filters.push(`condition = "${condition}"`);
    if (city) filters.push(`city = "${city}"`);
    if (minPrice !== undefined) filters.push(`price >= ${minPrice}`);
    if (maxPrice !== undefined) filters.push(`price <= ${maxPrice}`);
    if (excludeSellerIds && excludeSellerIds.length > 0) {
      filters.push(`sellerId NOT IN [${excludeSellerIds.map(id => `"${id}"`).join(', ')}]`);
    }

    const sortMap: Record<string, string> = {
      newest: 'createdAt:desc',
      oldest: 'createdAt:asc',
      price_asc: 'price:asc',
      price_desc: 'price:desc',
    };

    try {
      const result = await this.index.search(q, {
        filter: filters.join(' AND '),
        sort: [sortMap[sort] ?? 'createdAt:desc'],
        offset: (page - 1) * limit,
        limit,
        facets: ['categoryId', 'brandId', 'condition', 'city'],
      });

      return {
        items: result.hits,
        meta: {
          total: result.estimatedTotalHits ?? 0,
          page,
          limit,
          totalPages: Math.ceil((result.estimatedTotalHits ?? 0) / limit),
        },
        facets: result.facetDistribution ?? {},
      };
    } catch (err) {
      this.logger.warn(`Search failed: ${err.message}`);
      return { items: [], meta: { total: 0, page, limit, totalPages: 0 }, facets: {} };
    }
  }

  async reindexAll(listings: ListingDocument[]) {
    try {
      await this.index.addDocuments(listings, { primaryKey: 'id' });
      this.logger.log(`Reindexed ${listings.length} listings`);
    } catch (err) {
      this.logger.warn(`Reindex failed: ${err.message}`);
    }
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ListingsService {
  constructor(private prisma: PrismaService) {}
  // TODO: createListing, updateListing, deleteListing, listListings, getListingById
}

import { Module } from '@nestjs/common';
import { ListingsModule } from '../listings/listings.module.js';
import { MarketplaceCompilerModule } from '../marketplace-compiler/marketplace-compiler.module.js';
import { ListingPublishSnapshotService } from './listing-publish-snapshot.service.js';

@Module({
  imports: [ListingsModule, MarketplaceCompilerModule],
  providers: [ListingPublishSnapshotService],
  exports: [ListingPublishSnapshotService],
})
export class ListingPublishSnapshotModule {}

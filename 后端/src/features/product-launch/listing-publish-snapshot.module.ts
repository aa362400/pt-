import { Module } from '@nestjs/common';
import { ListingsModule } from '../listings/listings.module.js';
import { MarketplaceCompilerModule } from '../marketplace-compiler/marketplace-compiler.module.js';
import { ListingPublishSnapshotService } from './listing-publish-snapshot.service.js';
import { CandidateEconomicsPublishProofService } from './candidate-economics-publish-proof.service.js';

@Module({
  imports: [ListingsModule, MarketplaceCompilerModule],
  providers: [
    CandidateEconomicsPublishProofService,
    ListingPublishSnapshotService,
  ],
  exports: [
    CandidateEconomicsPublishProofService,
    ListingPublishSnapshotService,
  ],
})
export class ListingPublishSnapshotModule {}

import { Module } from '@nestjs/common';
import { CanonicalCatalogService } from './canonical-catalog.service.js';
import { MarketplaceCompilerService } from './marketplace-compiler.service.js';

@Module({
  providers: [CanonicalCatalogService, MarketplaceCompilerService],
  exports: [CanonicalCatalogService, MarketplaceCompilerService],
})
export class MarketplaceCompilerModule {}

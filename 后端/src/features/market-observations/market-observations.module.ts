import { Module } from '@nestjs/common';
import {
  MarketObservationsController,
  ProductOpportunitiesController,
} from './market-observations.controller.js';
import { MarketObservationsService } from './market-observations.service.js';
import { OpportunityScoringService } from './opportunity-scoring.service.js';

@Module({
  controllers: [MarketObservationsController, ProductOpportunitiesController],
  providers: [MarketObservationsService, OpportunityScoringService],
  exports: [MarketObservationsService, OpportunityScoringService],
})
export class MarketObservationsModule {}

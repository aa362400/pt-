import { Module } from '@nestjs/common';
import { ListingsController } from './listings.controller.js';
import { ListingsService } from './listings.service.js';
import { AgentModule } from '../../agents/agent.module.js';
import { ListingBundleService } from './listing-bundle.service.js';
import { ListingEvaluatorService } from './listing-evaluator.service.js';

@Module({
  imports: [AgentModule],
  controllers: [ListingsController],
  providers: [ListingsService, ListingBundleService, ListingEvaluatorService],
  exports: [ListingsService, ListingBundleService, ListingEvaluatorService],
})
export class ListingsModule {}

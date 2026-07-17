import { Module } from '@nestjs/common';
import { ListingsController } from './listings.controller.js';
import { ListingsService } from './listings.service.js';
import { AgentModule } from '../../agents/agent.module.js';
import { ListingBundleService } from './listing-bundle.service.js';
import { ListingEvaluatorService } from './listing-evaluator.service.js';
import { ListingRiskClearanceService } from './listing-risk-clearance.service.js';
import { RiskClearanceVerifierService } from '../../shared/risk/risk-clearance-verifier.service.js';
import { CommerceMcpClientService } from '../../shared/commerce-mcp/commerce-mcp-client.service.js';
import { CommerceMcpTrustService } from '../../shared/commerce-mcp/commerce-mcp-trust.service.js';

@Module({
  imports: [AgentModule],
  controllers: [ListingsController],
  providers: [
    ListingsService,
    ListingBundleService,
    ListingEvaluatorService,
    RiskClearanceVerifierService,
    ListingRiskClearanceService,
    CommerceMcpClientService,
    CommerceMcpTrustService,
  ],
  exports: [
    ListingsService,
    ListingBundleService,
    ListingEvaluatorService,
    RiskClearanceVerifierService,
    ListingRiskClearanceService,
    CommerceMcpTrustService,
  ],
})
export class ListingsModule {}

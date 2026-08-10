import { Module } from '@nestjs/common';
import { ConnectorRegistryService } from './connectors/connector-registry.service.js';
import { ManualImportConnector } from './connectors/manual-import.connector.js';
import { OzonEvidenceCacheConnector } from './connectors/ozon-evidence-cache.connector.js';
import { GlobalMarketplaceDiscoveryConnector } from './connectors/global-marketplace-discovery.connector.js';
import { AgentModule } from '../../../agents/agent.module.js';
import { DailyProductResearchController } from './daily-product-research.controller.js';
import { SupplierImageSearchEvidenceReadController } from './supplier-image-search-evidence-read.controller.js';
import { DailyProductResearchService } from './daily-product-research.service.js';
import { DailyReportRendererService } from './reports/daily-report-renderer.service.js';
import { ResearchArtifactStoreService } from './reports/research-artifact-store.service.js';
import { BusinessTimeService } from './services/business-time.service.js';
import { ComplianceScannerService } from './services/compliance-scanner.service.js';
import { CompetitionAnalysisService } from './services/competition-analysis.service.js';
import { DailyProductResearchOrchestratorService } from './services/daily-product-research-orchestrator.service.js';
import { DemandAnalysisService } from './services/demand-analysis.service.js';
import { KeywordExpansionService } from './services/keyword-expansion.service.js';
import { NormalizationService } from './services/normalization.service.js';
import { ProfitCapacityService } from './services/profit-capacity.service.js';
import { RiskAnalysisService } from './services/risk-analysis.service.js';
import { ScoringService } from './services/scoring.service.js';
import { DailyProductResearchRuntimePolicyService } from './services/daily-product-research-runtime-policy.service.js';
import { ProductResearchFeedbackService } from './services/feedback/product-research-feedback.service.js';
import { SupplierQuoteEvidencePolicyService } from './services/supplier-quote-evidence-policy.service.js';
import { SupplierQuoteEvidenceStoreService } from './services/supplier-quote-evidence-store.service.js';
import { SupplierImageSearchEvidenceStoreService } from './services/supplier-image-search-evidence-store.service.js';
import { SupplierImageSearchEvidenceReadService } from './services/supplier-image-search-evidence-read.service.js';
import { SupplierImageSearchAllocationService } from './services/supplier-image-search-allocation.service.js';
import { SupplierImageSearchEnrichmentService } from './services/supplier-image-search-enrichment.service.js';
import { TrustedProfitEconomicsPolicyService } from './services/trusted-profit-economics-policy.service.js';

@Module({
  imports: [AgentModule],
  controllers: [
    DailyProductResearchController,
    SupplierImageSearchEvidenceReadController,
  ],
  providers: [
    DailyProductResearchService,
    DailyProductResearchOrchestratorService,
    BusinessTimeService,
    ConnectorRegistryService,
    ManualImportConnector,
    OzonEvidenceCacheConnector,
    GlobalMarketplaceDiscoveryConnector,
    NormalizationService,
    KeywordExpansionService,
    DemandAnalysisService,
    CompetitionAnalysisService,
    ProfitCapacityService,
    ComplianceScannerService,
    RiskAnalysisService,
    ScoringService,
    DailyReportRendererService,
    ResearchArtifactStoreService,
    DailyProductResearchRuntimePolicyService,
    ProductResearchFeedbackService,
    SupplierQuoteEvidencePolicyService,
    SupplierQuoteEvidenceStoreService,
    SupplierImageSearchEvidenceStoreService,
    SupplierImageSearchEvidenceReadService,
    SupplierImageSearchAllocationService,
    SupplierImageSearchEnrichmentService,
    TrustedProfitEconomicsPolicyService,
  ],
  exports: [
    DailyProductResearchService,
    DailyProductResearchOrchestratorService,
    BusinessTimeService,
    SupplierQuoteEvidencePolicyService,
    SupplierQuoteEvidenceStoreService,
    SupplierImageSearchEvidenceStoreService,
    TrustedProfitEconomicsPolicyService,
  ],
})
export class DailyProductResearchModule {}

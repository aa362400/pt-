import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { WorkspacesModule } from './workspaces/workspaces.module.js';
import { ChannelsModule } from './channels/channels.module.js';
import { ProductsModule } from './products/products.module.js';
import { FilesModule } from './files/files.module.js';
import { KnowledgeBaseModule } from './knowledge-base/knowledge-base.module.js';
import { SopsModule } from './sops/sops.module.js';
import { TasksModule } from './tasks/tasks.module.js';
import { PromptsModule } from './prompts/prompts.module.js';
import { AssistantModule } from './assistant/assistant.module.js';
import { AgentRunsModule } from './agent-runs/agent-runs.module.js';
import { AutomationModule } from './automation/automation.module.js';
import { StoreMonitoringModule } from './store-monitoring/store-monitoring.module.js';
import { TrendsModule } from './trends/trends.module.js';
import { ProductResearchModule } from './product-research/product-research.module.js';
import { KeywordsModule } from './keywords/keywords.module.js';
import { ListingsModule } from './listings/listings.module.js';
import { ProfitCalculatorModule } from './profit-calculator/profit-calculator.module.js';
import { ImagePromptModule } from './image-prompt/image-prompt.module.js';
import { BillingModule } from './billing/billing.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { AuditLogsModule } from './audit-logs/audit-logs.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { LegalModule } from './legal/legal.module.js';
import { ReviewModule } from './review/review.module.js';
import { DeadLetterModule } from './dead-letter/dead-letter.module.js';
import { AgentDataModule } from './agent-data/agent-data.module.js';
import { AgentAutonomyModule } from './agent-autonomy/agent-autonomy.module.js';
import { AgentMemoryModule } from './agent-memory/agent-memory.module.js';
import { EventsModule } from './events/events.module.js';
import { AgentProxyModule } from './agent-proxy/agent-proxy.module.js';
import { AgentRoadmapModule } from './agent-roadmap/agent-roadmap.module.js';
import { ProductLaunchModule } from './product-launch/product-launch.module.js';
import { CapabilityCenterModule } from './capability-center/capability-center.module.js';
import { EnterpriseTeamModule } from './enterprise-team/enterprise-team.module.js';
import { SupplyChainModule } from './supply-chain/supply-chain.module.js';
import { EnterpriseSloModule } from './enterprise-slo/enterprise-slo.module.js';
import { AgentConsoleModule } from './agent-console/agent-console.module.js';
import { MarketObservationsModule } from './market-observations/market-observations.module.js';
import { ListingSandboxModule } from './listing-sandbox/listing-sandbox.module.js';
import { AgentEvaluationModule } from './agent-evaluation/agent-evaluation.module.js';

@Module({
  imports: [
    AgentEvaluationModule,
    ListingSandboxModule,
    EnterpriseSloModule,
    SupplyChainModule,
    EnterpriseTeamModule,
    CapabilityCenterModule,
    AgentRoadmapModule,
    ProductLaunchModule,
    AgentDataModule,
    AgentAutonomyModule,
    AgentMemoryModule,
    AgentConsoleModule,
    MarketObservationsModule,
    AgentProxyModule,
    DeadLetterModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    WorkspacesModule,
    ChannelsModule,
    ProductsModule,
    FilesModule,
    KnowledgeBaseModule,
    SopsModule,
    TasksModule,
    PromptsModule,
    AssistantModule,
    AgentRunsModule,
    AutomationModule,
    StoreMonitoringModule,
    TrendsModule,
    ProductResearchModule,
    KeywordsModule,
    ListingsModule,
    ProfitCalculatorModule,
    ImagePromptModule,
    BillingModule,
    NotificationsModule,
    AuditLogsModule,
    DashboardModule,
    LegalModule,
    ReviewModule,
    EventsModule,
  ],
  exports: [
    AgentEvaluationModule,
    ListingSandboxModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    WorkspacesModule,
    ChannelsModule,
    ProductsModule,
    FilesModule,
    KnowledgeBaseModule,
    SopsModule,
    TasksModule,
    PromptsModule,
    AssistantModule,
    AgentRunsModule,
    AutomationModule,
    StoreMonitoringModule,
    TrendsModule,
    ProductResearchModule,
    KeywordsModule,
    ListingsModule,
    ProfitCalculatorModule,
    ImagePromptModule,
    BillingModule,
    NotificationsModule,
    AuditLogsModule,
    DashboardModule,
    LegalModule,
    ReviewModule,
    AgentDataModule,
    AgentAutonomyModule,
    AgentMemoryModule,
    AgentRoadmapModule,
    ProductLaunchModule,
    EventsModule,
    SupplyChainModule,
    EnterpriseSloModule,
    AgentConsoleModule,
    MarketObservationsModule,
  ],
})
export class FeaturesModule {}

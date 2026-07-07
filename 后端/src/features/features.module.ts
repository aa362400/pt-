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

@Module({
  imports: [
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
  ],
  exports: [
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
  ],
})
export class FeaturesModule {}

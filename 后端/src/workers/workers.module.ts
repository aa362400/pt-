import { Module } from '@nestjs/common';
import { AgentModule } from '../agents/agent.module.js';
import { NotificationsModule } from '../features/notifications/notifications.module.js';
import { ProductResearchModule } from '../features/product-research/product-research.module.js';
import { ReviewModule } from '../features/review/review.module.js';
import { AgentMemoryModule } from '../features/agent-memory/agent-memory.module.js';
import { ListingsModule } from '../features/listings/listings.module.js';
import { ProfitCalculatorModule } from '../features/profit-calculator/profit-calculator.module.js';
import { ImagePromptModule } from '../features/image-prompt/image-prompt.module.js';
import { TasksModule } from '../features/tasks/tasks.module.js';
import { AgentAutonomyModule } from '../features/agent-autonomy/agent-autonomy.module.js';
import { ProductLaunchModule } from '../features/product-launch/product-launch.module.js';
import { FilesModule } from '../features/files/files.module.js';
import { ChannelsModule } from '../features/channels/channels.module.js';
import { MetricsModule } from '../shared/metrics/metrics.module.js';
import { AgentRunWorker } from './agent-run.worker.js';
import { AutomationWorker } from './automation.worker.js';
import { ExportWorker } from './export.worker.js';
import { NotificationWorker } from './notification.worker.js';
import { ReviewNotificationWorker } from './review-notification.worker.js';
import { PlatformEventWorker } from './platform-event.worker.js';
import { ProductLaunchWorker } from './product-launch.worker.js';
import { DailyProductResearchModule } from '../features/product-research/daily/daily-product-research.module.js';
import { DailyProductResearchWorker } from './daily-product-research.worker.js';
import { AutomationModule } from '../features/automation/automation.module.js';
import { AgentConsoleModule } from '../features/agent-console/agent-console.module.js';
import { AgentPlanWorker } from './agent-plan.worker.js';
import { AgentRunsModule } from '../features/agent-runs/agent-runs.module.js';
import { ListingSandboxModule } from '../features/listing-sandbox/listing-sandbox.module.js';
import { AgentPermissionsModule } from '../shared/agent-permissions/agent-permissions.module.js';
// DeadLetterWorker is already registered in QueueModule (global),
// but we keep it referenced here for dependency clarity.

@Module({
  imports: [
    AgentModule,
    ReviewModule,
    AgentMemoryModule,
    MetricsModule,
    NotificationsModule,
    ProductResearchModule,
    ListingsModule,
    ProfitCalculatorModule,
    ImagePromptModule,
    TasksModule,
    AgentAutonomyModule,
    ProductLaunchModule,
    FilesModule,
    ChannelsModule,
    DailyProductResearchModule,
    AutomationModule,
    AgentConsoleModule,
    AgentRunsModule,
    ListingSandboxModule,
    AgentPermissionsModule,
  ],
  providers: [
    AgentRunWorker,
    AutomationWorker,
    ExportWorker,
    NotificationWorker,
    ReviewNotificationWorker,
    PlatformEventWorker,
    ProductLaunchWorker,
    DailyProductResearchWorker,
    AgentPlanWorker,
  ],
})
export class WorkersModule {}

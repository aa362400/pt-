import { Module } from '@nestjs/common';
import { AgentModule } from '../agents/agent.module.js';
import { ReviewModule } from '../features/review/review.module.js';
import { AgentRunWorker } from './agent-run.worker.js';
import { AutomationWorker } from './automation.worker.js';
import { ExportWorker } from './export.worker.js';
import { NotificationWorker } from './notification.worker.js';
import { ReviewNotificationWorker } from './review-notification.worker.js';
// DeadLetterWorker is already registered in QueueModule (global),
// but we keep it referenced here for dependency clarity.

@Module({
  imports: [AgentModule, ReviewModule],
  providers: [
    AgentRunWorker,
    AutomationWorker,
    ExportWorker,
    NotificationWorker,
    ReviewNotificationWorker,
  ],
})
export class WorkersModule {}

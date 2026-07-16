import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AgentAutonomyService } from './agent-autonomy.service.js';
import { AgentAutonomyController } from './agent-autonomy.controller.js';
import { AgentRunsModule } from '../agent-runs/agent-runs.module.js';

@Module({
  imports: [NotificationsModule, AgentRunsModule],
  controllers: [AgentAutonomyController],
  providers: [AgentAutonomyService],
  exports: [AgentAutonomyService],
})
export class AgentAutonomyModule {}

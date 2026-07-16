import { Module } from '@nestjs/common';
import { AssistantModule } from '../assistant/assistant.module.js';
import { AgentAutonomyModule } from '../agent-autonomy/agent-autonomy.module.js';
import { ActionProposalsModule } from '../notifications/action-proposals.module.js';
import {
  AgentConversationsController,
  AgentPlansController,
  AgentToolExecutionsController,
  AgentToolsController,
} from './agent-console.controller.js';
import { AgentConsoleService } from './agent-console.service.js';
import { AgentPlanQueueRecoveryService } from './agent-plan-queue-recovery.service.js';
import { AgentToolRegistryService } from './agent-tool-registry.service.js';

@Module({
  imports: [AssistantModule, AgentAutonomyModule, ActionProposalsModule],
  controllers: [
    AgentConversationsController,
    AgentPlansController,
    AgentToolExecutionsController,
    AgentToolsController,
  ],
  providers: [
    AgentConsoleService,
    AgentToolRegistryService,
    AgentPlanQueueRecoveryService,
  ],
  exports: [AgentConsoleService, AgentToolRegistryService],
})
export class AgentConsoleModule {}

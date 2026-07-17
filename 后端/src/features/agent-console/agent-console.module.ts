import { Module } from '@nestjs/common';
import { AssistantModule } from '../assistant/assistant.module.js';
import { AgentAutonomyModule } from '../agent-autonomy/agent-autonomy.module.js';
import { AgentModule } from '../../agents/agent.module.js';
import { ActionProposalsModule } from '../notifications/action-proposals.module.js';
import {
  AgentConversationsController,
  AgentPlansController,
  AgentToolExecutionsController,
  AgentToolsController,
  AgentChannelHealthController,
} from './agent-console.controller.js';
import { AgentConsoleService } from './agent-console.service.js';
import { AgentPlanQueueRecoveryService } from './agent-plan-queue-recovery.service.js';
import { AgentToolRegistryService } from './agent-tool-registry.service.js';

@Module({
  imports: [
    AssistantModule,
    AgentAutonomyModule,
    ActionProposalsModule,
    AgentModule,
  ],
  controllers: [
    AgentConversationsController,
    AgentPlansController,
    AgentToolExecutionsController,
    AgentToolsController,
    AgentChannelHealthController,
  ],
  providers: [
    AgentConsoleService,
    AgentToolRegistryService,
    AgentPlanQueueRecoveryService,
  ],
  exports: [AgentConsoleService, AgentToolRegistryService],
})
export class AgentConsoleModule {}

import { Module } from '@nestjs/common';
import { AgentMemoryController } from './agent-memory.controller.js';
import { AgentMemoryService } from './agent-memory.service.js';
import { StoreAgentProfileController } from './store-agent-profile.controller.js';
import { StoreAgentProfileService } from './store-agent-profile.service.js';
import { AgentMemoryGovernanceController } from './agent-memory-governance.controller.js';
import { AgentMemoryGovernanceService } from './agent-memory-governance.service.js';

@Module({
  controllers: [
    AgentMemoryController,
    AgentMemoryGovernanceController,
    StoreAgentProfileController,
  ],
  providers: [
    AgentMemoryService,
    AgentMemoryGovernanceService,
    StoreAgentProfileService,
  ],
  exports: [AgentMemoryService, StoreAgentProfileService],
})
export class AgentMemoryModule {}

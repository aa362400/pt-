import { Module } from '@nestjs/common';
import { AgentAutonomyModule } from '../agent-autonomy/agent-autonomy.module.js';
import { AgentMemoryModule } from '../agent-memory/agent-memory.module.js';
import { AgentRunsModule } from '../agent-runs/agent-runs.module.js';
import { ReviewModule } from '../review/review.module.js';
import { AgentRoadmapController } from './agent-roadmap.controller.js';
import { AgentRoadmapService } from './agent-roadmap.service.js';

@Module({
  imports: [
    AgentAutonomyModule,
    AgentMemoryModule,
    AgentRunsModule,
    ReviewModule,
  ],
  controllers: [AgentRoadmapController],
  providers: [AgentRoadmapService],
  exports: [AgentRoadmapService],
})
export class AgentRoadmapModule {}

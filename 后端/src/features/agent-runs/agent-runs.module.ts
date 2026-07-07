import { Module } from '@nestjs/common';
import { AgentRunsController } from './agent-runs.controller.js';
import { AgentRunsService } from './agent-runs.service.js';

@Module({
  controllers: [AgentRunsController],
  providers: [AgentRunsService],
  exports: [AgentRunsService],
})
export class AgentRunsModule {}

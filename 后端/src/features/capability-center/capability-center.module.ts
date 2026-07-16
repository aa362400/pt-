import { Module } from '@nestjs/common';
import { AgentRoadmapModule } from '../agent-roadmap/agent-roadmap.module.js';
import { CapabilityCenterController } from './capability-center.controller.js';
import { CapabilityCenterService } from './capability-center.service.js';

@Module({
  imports: [AgentRoadmapModule],
  controllers: [CapabilityCenterController],
  providers: [CapabilityCenterService],
  exports: [CapabilityCenterService],
})
export class CapabilityCenterModule {}

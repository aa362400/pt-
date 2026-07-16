import { Module } from '@nestjs/common';
import { CapabilityCenterModule } from '../capability-center/capability-center.module.js';
import { AgentDataController } from './agent-data.controller.js';

@Module({
  imports: [CapabilityCenterModule],
  controllers: [AgentDataController],
})
export class AgentDataModule {}

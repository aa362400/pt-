import { Module } from '@nestjs/common';
import { AgentRunsModule } from '../agent-runs/agent-runs.module.js';
import { CapabilityCenterModule } from '../capability-center/capability-center.module.js';
import { EnterpriseTeamController } from './enterprise-team.controller.js';
import { EnterpriseTeamService } from './enterprise-team.service.js';

@Module({
  imports: [AgentRunsModule, CapabilityCenterModule],
  controllers: [EnterpriseTeamController],
  providers: [EnterpriseTeamService],
})
export class EnterpriseTeamModule {}

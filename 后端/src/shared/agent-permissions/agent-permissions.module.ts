import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module.js';
import { AgentPermissionsService } from './agent-permissions.service.js';
import { AgentPermissionsGuard } from './agent-permissions.guard.js';
import { AgentKillSwitchController } from './agent-kill-switch.controller.js';
import { OrganizationAgentControlService } from '../agent-control/organization-agent-control.service.js';
import { AuditModule } from '../audit/audit.module.js';
import { QueueModule } from '../queue/queue.module.js';
import { OrganizationAgentControlResumeDispatcherService } from '../agent-control/organization-agent-control-resume-dispatcher.service.js';

@Global()
@Module({
  imports: [PrismaModule, AuditModule, QueueModule],
  controllers: [AgentKillSwitchController],
  providers: [
    OrganizationAgentControlService,
    OrganizationAgentControlResumeDispatcherService,
    AgentPermissionsService,
    AgentPermissionsGuard,
  ],
  exports: [
    OrganizationAgentControlService,
    OrganizationAgentControlResumeDispatcherService,
    AgentPermissionsService,
    AgentPermissionsGuard,
  ],
})
export class AgentPermissionsModule {}

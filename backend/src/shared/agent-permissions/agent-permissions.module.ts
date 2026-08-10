import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module.js';
import { AgentPermissionsService } from './agent-permissions.service.js';
import { AgentPermissionsGuard } from './agent-permissions.guard.js';
import { AgentKillSwitchController } from './agent-kill-switch.controller.js';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [AgentKillSwitchController],
  providers: [AgentPermissionsService, AgentPermissionsGuard],
  exports: [AgentPermissionsService, AgentPermissionsGuard],
})
export class AgentPermissionsModule {}

import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { LinkfoxSkillCliService } from '../../shared/linkfox-skill/linkfox-skill-cli.service.js';
import { AutomationModule } from '../automation/automation.module.js';
import { AgentRunsModule } from '../agent-runs/agent-runs.module.js';
import { OzonApprovedActionRouterService } from './ozon-approved-action-router.service.js';
import { ActionProposalsModule } from './action-proposals.module.js';
import { ChannelsModule } from '../channels/channels.module.js';
import { ListingSandboxModule } from '../listing-sandbox/listing-sandbox.module.js';
import { ApprovalItemsController } from './approval-items.controller.js';

@Module({
  imports: [
    AutomationModule,
    AgentRunsModule,
    ActionProposalsModule,
    ChannelsModule,
    ListingSandboxModule,
  ],
  controllers: [NotificationsController, ApprovalItemsController],
  providers: [
    NotificationsService,
    LinkfoxSkillCliService,
    OzonApprovedActionRouterService,
  ],
  exports: [NotificationsService, ActionProposalsModule],
})
export class NotificationsModule {}

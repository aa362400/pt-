import { Module } from '@nestjs/common';
import { ActionProposalsService } from './action-proposals.service.js';
import { NotificationEventsService } from './notification-events.service.js';
import { ActionProposalRecoveryService } from './action-proposal-recovery.service.js';

@Module({
  providers: [
    ActionProposalsService,
    NotificationEventsService,
    ActionProposalRecoveryService,
  ],
  exports: [ActionProposalsService, NotificationEventsService],
})
export class ActionProposalsModule {}

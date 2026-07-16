import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { AgentRunsController } from './agent-runs.controller.js';
import { AgentRunsService } from './agent-runs.service.js';
import { AgentRunOutboxPublisher } from './agent-run-outbox.publisher.js';
import { AgentRunLifecycleService } from './agent-run-lifecycle.service.js';
import { AgentRunLeaseService } from './agent-run-lease.service.js';
import { AgentRunRecoveryService } from './agent-run-recovery.service.js';
import { AgentRunConsistencyService } from './agent-run-consistency.service.js';

@Module({
  imports: [BillingModule],
  controllers: [AgentRunsController],
  providers: [
    AgentRunsService,
    AgentRunLifecycleService,
    AgentRunLeaseService,
    AgentRunRecoveryService,
    AgentRunConsistencyService,
    AgentRunOutboxPublisher,
  ],
  exports: [AgentRunsService, AgentRunLifecycleService, AgentRunLeaseService],
})
export class AgentRunsModule {}

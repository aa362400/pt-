import { Module } from '@nestjs/common';
import { AgentRunsModule } from '../agent-runs/agent-runs.module.js';
import { AutomationModule } from '../automation/automation.module.js';
import { DeadLetterController } from './dead-letter.controller.js';
import { DeadLetterService } from './dead-letter.service.js';
import { DeadLetterTriageService } from './dead-letter-triage.service.js';

@Module({
  controllers: [DeadLetterController],
  imports: [AgentRunsModule, AutomationModule],
  providers: [DeadLetterService, DeadLetterTriageService],
  exports: [DeadLetterService, DeadLetterTriageService],
})
export class DeadLetterModule {}

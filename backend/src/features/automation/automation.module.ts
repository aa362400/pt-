import { Module } from '@nestjs/common';
import { AutomationController } from './automation.controller.js';
import { AutomationSchedulerService } from './automation-scheduler.service.js';
import { AutomationService } from './automation.service.js';
import { AutomationStepExecutionsService } from './automation-step-executions.service.js';

@Module({
  controllers: [AutomationController],
  providers: [
    AutomationService,
    AutomationSchedulerService,
    AutomationStepExecutionsService,
  ],
  exports: [
    AutomationService,
    AutomationSchedulerService,
    AutomationStepExecutionsService,
  ],
})
export class AutomationModule {}

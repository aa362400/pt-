import { Module } from '@nestjs/common';
import {
  AgentEvaluationsController,
  BusinessOutcomesController,
  FeedbackSignalsController,
  PromptVersionsController,
} from './agent-evaluation.controller.js';
import { AgentEvaluationService } from './agent-evaluation.service.js';

@Module({
  controllers: [
    FeedbackSignalsController,
    AgentEvaluationsController,
    PromptVersionsController,
    BusinessOutcomesController,
  ],
  providers: [AgentEvaluationService],
  exports: [AgentEvaluationService],
})
export class AgentEvaluationModule {}

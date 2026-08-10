import { Module } from '@nestjs/common';
import { KeywordsController } from './keywords.controller.js';
import { KeywordsService } from './keywords.service.js';
import { AgentModule } from '../../agents/agent.module.js';

@Module({
  imports: [AgentModule],
  controllers: [KeywordsController],
  providers: [KeywordsService],
  exports: [KeywordsService],
})
export class KeywordsModule {}

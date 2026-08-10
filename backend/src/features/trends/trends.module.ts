import { Module } from '@nestjs/common';
import { TrendsController } from './trends.controller.js';
import { TrendsService } from './trends.service.js';
import { AgentModule } from '../../agents/agent.module.js';

@Module({
  imports: [AgentModule],
  controllers: [TrendsController],
  providers: [TrendsService],
  exports: [TrendsService],
})
export class TrendsModule {}

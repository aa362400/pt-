import { Module } from '@nestjs/common';
import { ListingsController } from './listings.controller.js';
import { ListingsService } from './listings.service.js';
import { AgentModule } from '../../agents/agent.module.js';

@Module({
  imports: [AgentModule],
  controllers: [ListingsController],
  providers: [ListingsService],
  exports: [ListingsService],
})
export class ListingsModule {}

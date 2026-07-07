import { Module } from '@nestjs/common';
import { ProductResearchController } from './product-research.controller.js';
import { ProductResearchService } from './product-research.service.js';
import { AgentModule } from '../../agents/agent.module.js';

@Module({
  imports: [AgentModule],
  controllers: [ProductResearchController],
  providers: [ProductResearchService],
  exports: [ProductResearchService],
})
export class ProductResearchModule {}

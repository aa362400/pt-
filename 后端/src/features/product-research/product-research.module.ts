import { Module } from '@nestjs/common';
import { ProductResearchController } from './product-research.controller.js';
import { ProductResearchService } from './product-research.service.js';
import { AgentModule } from '../../agents/agent.module.js';
import { ProductsModule } from '../products/products.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AgentMemoryModule } from '../agent-memory/agent-memory.module.js';
import { DailyProductResearchModule } from './daily/daily-product-research.module.js';

@Module({
  imports: [
    AgentModule,
    ProductsModule,
    NotificationsModule,
    AgentMemoryModule,
    DailyProductResearchModule,
  ],
  controllers: [ProductResearchController],
  providers: [ProductResearchService],
  exports: [ProductResearchService],
})
export class ProductResearchModule {}

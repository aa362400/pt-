import { Module } from '@nestjs/common';
import { AgentMemoryModule } from '../agent-memory/agent-memory.module.js';
import { ProductLaunchModule } from '../product-launch/product-launch.module.js';
import { ReviewController } from './review.controller.js';
import { ReviewService } from './review.service.js';
import { ListingsModule } from '../listings/listings.module.js';
import { SupplyChainModule } from '../supply-chain/supply-chain.module.js';

@Module({
  imports: [
    AgentMemoryModule,
    ProductLaunchModule,
    ListingsModule,
    SupplyChainModule,
  ],
  controllers: [ReviewController],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}

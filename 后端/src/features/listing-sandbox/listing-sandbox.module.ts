import { Module } from '@nestjs/common';
import { ListingSandboxController } from './listing-sandbox.controller.js';
import { ListingSandboxRuleEngine } from './listing-sandbox-rule-engine.js';
import { ListingSandboxService } from './listing-sandbox.service.js';

@Module({
  controllers: [ListingSandboxController],
  providers: [ListingSandboxRuleEngine, ListingSandboxService],
  exports: [ListingSandboxRuleEngine, ListingSandboxService],
})
export class ListingSandboxModule {}

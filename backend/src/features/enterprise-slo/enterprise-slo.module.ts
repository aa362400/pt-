import { Module } from '@nestjs/common';
import { EnterpriseSloController } from './enterprise-slo.controller.js';
import { EnterpriseSloService } from './enterprise-slo.service.js';
import { JudgeGoldApprovalService } from './judge-gold-approval.service.js';

@Module({
  controllers: [EnterpriseSloController],
  providers: [EnterpriseSloService, JudgeGoldApprovalService],
  exports: [EnterpriseSloService, JudgeGoldApprovalService],
})
export class EnterpriseSloModule {}

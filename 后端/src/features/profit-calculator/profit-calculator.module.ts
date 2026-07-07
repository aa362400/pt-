import { Module } from '@nestjs/common';
import { ProfitCalculatorController } from './profit-calculator.controller.js';
import { ProfitCalculatorService } from './profit-calculator.service.js';

@Module({
  controllers: [ProfitCalculatorController],
  providers: [ProfitCalculatorService],
  exports: [ProfitCalculatorService],
})
export class ProfitCalculatorModule {}

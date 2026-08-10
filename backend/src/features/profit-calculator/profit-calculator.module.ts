import { Module } from '@nestjs/common';
import { ProfitCalculatorController } from './profit-calculator.controller.js';
import { ProfitCalculatorService } from './profit-calculator.service.js';
import { CommerceMcpClientService } from '../../shared/commerce-mcp/commerce-mcp-client.service.js';
import { OzonPricingWorkbookImportService } from './ozon-pricing-workbook-import.service.js';

@Module({
  controllers: [ProfitCalculatorController],
  providers: [
    ProfitCalculatorService,
    CommerceMcpClientService,
    OzonPricingWorkbookImportService,
  ],
  exports: [ProfitCalculatorService],
})
export class ProfitCalculatorModule {}

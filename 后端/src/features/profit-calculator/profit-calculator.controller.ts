import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProfitCalculatorService } from './profit-calculator.service.js';
import {
  CalculateProfitDto,
  CalculateOzonPricingDto,
  BatchCalculateOzonPricingDto,
  ListProfitCalcsQueryDto,
  ImportOzonPricingWorkbookDto,
} from './profit-calculator.dto.js';
import { OzonPricingWorkbookImportService } from './ozon-pricing-workbook-import.service.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';

@ApiTags('ProfitCalculator')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('profit-calculator')
export class ProfitCalculatorController {
  constructor(
    private readonly profitCalculatorService: ProfitCalculatorService,
    private readonly ozonWorkbookImport: OzonPricingWorkbookImportService,
  ) {}

  @Post('calculate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Calculate profit and save the result' })
  calculate(@CurrentUser() user: JwtPayload, @Body() dto: CalculateProfitDto) {
    return this.profitCalculatorService.calculate(user, dto);
  }

  @Get('ozon/categories')
  @ApiOperation({
    summary: 'List workbook-backed Ozon pricing categories and defaults',
  })
  ozonCategories() {
    return this.profitCalculatorService.getOzonCategories();
  }

  @Post('ozon/calculate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Calculate or evaluate Ozon price from the imported seller workbook',
  })
  calculateOzon(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CalculateOzonPricingDto,
  ) {
    return this.profitCalculatorService.calculateOzon(user, dto);
  }

  @Post('ozon/batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Batch calculate or evaluate up to 100 Ozon prices with audit records',
  })
  calculateOzonBatch(
    @CurrentUser() user: JwtPayload,
    @Body() dto: BatchCalculateOzonPricingDto,
  ) {
    return this.profitCalculatorService.calculateOzonBatch(user, dto);
  }

  @Post('ozon/import-workbook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Verify and import the complete Ozon seller pricing workbook with strict source evidence',
  })
  importOzonWorkbook(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ImportOzonPricingWorkbookDto,
  ) {
    return this.ozonWorkbookImport.importWorkbook(user, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List profit calculations (filter by workspace/product)',
  })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListProfitCalcsQueryDto,
  ) {
    return this.profitCalculatorService.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a profit calculation by ID' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.profitCalculatorService.findOne(user, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a profit calculation' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.profitCalculatorService.remove(user, id);
  }
}

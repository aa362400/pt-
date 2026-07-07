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
  ListProfitCalcsQueryDto,
} from './profit-calculator.dto.js';
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
  ) {}

  @Post('calculate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Calculate profit and save the result' })
  calculate(@CurrentUser() user: JwtPayload, @Body() dto: CalculateProfitDto) {
    return this.profitCalculatorService.calculate(user, dto);
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

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import {
  CreateSupplierDto,
  CreateSupplySkuDto,
  DecideSupplyPlanDto,
  GenerateReplenishmentPlansDto,
  RequestPlanApprovalDto,
  SupplyChainQueryDto,
} from './supply-chain.dto.js';
import { SupplyChainService } from './supply-chain.service.js';

@ApiTags('Supply Chain')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('supply-chain')
export class SupplyChainController {
  constructor(private readonly supplyChain: SupplyChainService) {}

  @Get()
  @ApiOperation({
    summary:
      'Read organization-scoped supply records and deterministic forecasts',
  })
  overview(
    @CurrentUser() user: JwtPayload,
    @Query() query: SupplyChainQueryDto,
  ) {
    return this.supplyChain.overview(user, query);
  }

  @Post('suppliers')
  @ApiOperation({ summary: 'Create a local supplier record' })
  createSupplier(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSupplierDto,
  ) {
    return this.supplyChain.createSupplier(user, dto);
  }

  @Post('skus')
  @ApiOperation({
    summary: 'Create a local supplier SKU and inventory profile',
  })
  createSku(@CurrentUser() user: JwtPayload, @Body() dto: CreateSupplySkuDto) {
    return this.supplyChain.createSku(user, dto);
  }

  @Post('plans/generate')
  @ApiOperation({
    summary: 'Generate deterministic local replenishment plan drafts',
  })
  generatePlans(
    @CurrentUser() user: JwtPayload,
    @Body() dto: GenerateReplenishmentPlansDto,
  ) {
    return this.supplyChain.generatePlans(user, dto);
  }

  @Post('plans/:id/request-approval')
  @ApiOperation({
    summary: 'Create a human review task for a local replenishment plan',
  })
  requestApproval(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RequestPlanApprovalDto,
  ) {
    return this.supplyChain.requestApproval(user, id, dto);
  }

  @Post('plans/:id/decision')
  @ApiOperation({
    summary: 'Approve or reject a local plan without placing an external order',
  })
  decide(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: DecideSupplyPlanDto,
  ) {
    return this.supplyChain.decide(user, id, dto);
  }
}

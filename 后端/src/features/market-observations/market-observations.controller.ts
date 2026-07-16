import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { Roles } from '../../shared/rbac/roles.decorator.js';
import {
  CreateBusinessOutcomeDto,
  CreateMarketObservationDto,
  ListMarketObservationsQueryDto,
  RecordOpportunityDecisionDto,
} from './market-observations.dto.js';
import { MarketObservationsService } from './market-observations.service.js';

@ApiTags('Market Observations')
@ApiBearerAuth()
@Controller('market-observations')
export class MarketObservationsController {
  constructor(private readonly observations: MarketObservationsService) {}

  @Post()
  @ApiOperation({ summary: 'Collect user-visible Ozon public page evidence' })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateMarketObservationDto,
  ) {
    return this.observations.create(user, dto);
  }

  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListMarketObservationsQueryDto,
  ) {
    return this.observations.list(user, query);
  }

  @Get(':id')
  get(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.observations.get(user, id);
  }

  @Post(':id/score')
  score(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.observations.scoreBatch(user, id);
  }
}

@ApiTags('Product Opportunities')
@ApiBearerAuth()
@Controller('product-opportunities')
export class ProductOpportunitiesController {
  constructor(private readonly observations: MarketObservationsService) {}

  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListMarketObservationsQueryDto,
  ) {
    return this.observations.listOpportunities(user, query);
  }

  @Put(':id/decision')
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  decide(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RecordOpportunityDecisionDto,
  ) {
    return this.observations.decideOpportunity(user, id, dto);
  }

  @Post(':id/outcomes')
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  outcome(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CreateBusinessOutcomeDto,
  ) {
    return this.observations.recordOutcome(user, id, dto);
  }
}

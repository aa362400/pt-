import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service.js';
import { DashboardParamsDto } from './dashboard.dto.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('pipeline')
  @ApiOperation({
    summary: 'Get the organization-scoped research-to-publish pipeline',
  })
  getPipeline(
    @CurrentUser() user: JwtPayload,
    @Query() params: DashboardParamsDto,
  ) {
    return this.dashboardService.getPipeline(user, params);
  }

  @Get('counts')
  @ApiOperation({
    summary: 'Get aggregate counts (products, listings, runs, tasks, etc.)',
  })
  getCounts(
    @CurrentUser() user: JwtPayload,
    @Query() params: DashboardParamsDto,
  ) {
    return this.dashboardService.getCounts(user, params);
  }

  @Get('recent-activity')
  @ApiOperation({
    summary:
      'Get recent activity timeline (agent runs, notifications, audit logs)',
  })
  getRecentActivity(
    @CurrentUser() user: JwtPayload,
    @Query() params: DashboardParamsDto,
  ) {
    return this.dashboardService.getRecentActivity(user, params);
  }

  @Get('opportunities')
  @ApiOperation({
    summary:
      'Get actionable dashboard opportunities from notifications, tasks, and research reports',
  })
  getOpportunities(
    @CurrentUser() user: JwtPayload,
    @Query() params: DashboardParamsDto,
  ) {
    return this.dashboardService.getOpportunities(user, params);
  }

  @Get('hot-products')
  @ApiOperation({
    summary:
      'Get product catalog insight from real Product rows; not a fake sales ranking',
  })
  getHotProducts(
    @CurrentUser() user: JwtPayload,
    @Query() params: DashboardParamsDto,
  ) {
    return this.dashboardService.getHotProducts(user, params);
  }

  @Get('profit-summary')
  @ApiOperation({
    summary: 'Get profit summary from saved ProfitCalculation rows',
  })
  getProfitSummary(
    @CurrentUser() user: JwtPayload,
    @Query() params: DashboardParamsDto,
  ) {
    return this.dashboardService.getProfitSummary(user, params);
  }

  @Get('trends')
  @ApiOperation({ summary: 'Get trend summaries and top keywords' })
  getTrendSummaries(
    @CurrentUser() user: JwtPayload,
    @Query() params: DashboardParamsDto,
  ) {
    return this.dashboardService.getTrendSummaries(user, params);
  }
}

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

  @Get('counts')
  @ApiOperation({ summary: 'Get aggregate counts (products, listings, runs, tasks, etc.)' })
  getCounts(
    @CurrentUser() user: JwtPayload,
    @Query() params: DashboardParamsDto,
  ) {
    return this.dashboardService.getCounts(user, params);
  }

  @Get('recent-activity')
  @ApiOperation({ summary: 'Get recent activity timeline (agent runs, notifications, audit logs)' })
  getRecentActivity(
    @CurrentUser() user: JwtPayload,
    @Query() params: DashboardParamsDto,
  ) {
    return this.dashboardService.getRecentActivity(user, params);
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

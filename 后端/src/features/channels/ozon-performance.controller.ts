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
  ConnectOzonPerformanceDto,
  OzonPerformanceOverviewQueryDto,
  RequestOzonCampaignActionDto,
} from './channels.dto.js';
import { OzonPerformanceService } from './ozon-performance.service.js';

@ApiTags('Ozon Performance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('channels/ozon-performance')
export class OzonPerformanceController {
  constructor(private readonly service: OzonPerformanceService) {}

  @Post('connect')
  @ApiOperation({ summary: 'Connect and verify Ozon Performance API' })
  connect(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ConnectOzonPerformanceDto,
  ) {
    return this.service.connect(user, dto);
  }

  @Get('overview')
  @ApiOperation({ summary: 'Read live Ozon campaigns and daily statistics' })
  overview(
    @CurrentUser() user: JwtPayload,
    @Query() query: OzonPerformanceOverviewQueryDto,
  ) {
    return this.service.overview(user, query);
  }

  @Post('campaigns/:campaignId/action-request')
  @ApiOperation({
    summary: 'Create a human-confirmed Ozon campaign write request',
  })
  requestAction(
    @CurrentUser() user: JwtPayload,
    @Param('campaignId') campaignId: string,
    @Body() dto: RequestOzonCampaignActionDto,
  ) {
    return this.service.requestCampaignAction(user, campaignId, dto);
  }
}

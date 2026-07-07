import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { StoreMonitoringService } from './store-monitoring.service.js';
import {
  CreateAlertDto,
  ListAlertsQueryDto,
  ListMetricsQueryDto,
  UpdateAlertStatusDto,
  UpsertMetricDto,
} from './store-monitoring.dto.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';

@ApiTags('StoreMonitoring')
@ApiBearerAuth()
@Controller('store-monitoring')
export class StoreMonitoringController {
  constructor(
    private readonly storeMonitoringService: StoreMonitoringService,
  ) {}

  @Post('metrics')
  @ApiOperation({ summary: 'Upsert a daily store metric snapshot' })
  upsertMetric(@CurrentUser() user: JwtPayload, @Body() dto: UpsertMetricDto) {
    return this.storeMonitoringService.upsertMetric(user, dto);
  }

  @Get('metrics')
  @ApiOperation({ summary: 'List metric snapshots of a workspace' })
  listMetrics(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListMetricsQueryDto,
  ) {
    return this.storeMonitoringService.listMetrics(user, query);
  }

  @Post('alerts')
  @ApiOperation({ summary: 'Create a manual alert' })
  createAlert(@CurrentUser() user: JwtPayload, @Body() dto: CreateAlertDto) {
    return this.storeMonitoringService.createAlert(user, dto);
  }

  @Get('alerts')
  @ApiOperation({ summary: 'List alerts (status/severity filters)' })
  listAlerts(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListAlertsQueryDto,
  ) {
    return this.storeMonitoringService.listAlerts(user, query);
  }

  @Patch('alerts/:id')
  @ApiOperation({ summary: 'Acknowledge/resolve/dismiss an alert' })
  updateAlertStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateAlertStatusDto,
  ) {
    return this.storeMonitoringService.updateAlertStatus(user, id, dto);
  }
}

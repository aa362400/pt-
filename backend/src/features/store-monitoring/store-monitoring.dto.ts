import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { AlertSeverity, AlertStatus, AlertType } from '@prisma/client';
import { PageQueryDto } from '../../shared/dto/page-query.dto.js';

export const ALERT_TYPES = [
  'SYSTEM',
  'SALES_DROP',
  'INVENTORY',
  'PRICE_CHANGE',
  'POLICY_CHANGE',
  'REVIEW_ALERT',
  'AD_PERFORMANCE',
  'ACCOUNT_HEALTH',
] as const;

export const ALERT_SEVERITIES = [
  'INFO',
  'WARNING',
  'CRITICAL',
  'EMERGENCY',
] as const;

export const ALERT_STATUSES = [
  'OPEN',
  'ACKNOWLEDGED',
  'RESOLVED',
  'DISMISSED',
] as const;

export class UpsertMetricDto {
  @ApiProperty()
  @IsString()
  workspaceId: string;

  @ApiProperty({ description: 'Snapshot date (ISO, time part ignored)' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  healthScore?: number;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  orders?: number;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  revenue?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  conversionRate?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  acos?: number;
}

export class ListMetricsQueryDto {
  @ApiProperty()
  @IsString()
  workspaceId: string;

  @ApiPropertyOptional({ description: 'ISO start date (inclusive)' })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO end date (inclusive)' })
  @IsDateString()
  @IsOptional()
  to?: string;
}

export class CreateAlertDto {
  @ApiProperty({ enum: ALERT_TYPES })
  @IsIn(ALERT_TYPES)
  type: AlertType;

  @ApiPropertyOptional({ enum: ALERT_SEVERITIES, default: 'WARNING' })
  @IsIn(ALERT_SEVERITIES)
  @IsOptional()
  severity?: AlertSeverity;

  @ApiProperty()
  @IsString()
  @MaxLength(300)
  title: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;
}

export class UpdateAlertStatusDto {
  @ApiProperty({ enum: ALERT_STATUSES })
  @IsIn(ALERT_STATUSES)
  status: AlertStatus;
}

export class ListAlertsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ALERT_STATUSES })
  @IsIn(ALERT_STATUSES)
  @IsOptional()
  status?: AlertStatus;

  @ApiPropertyOptional({ enum: ALERT_SEVERITIES })
  @IsIn(ALERT_SEVERITIES)
  @IsOptional()
  severity?: AlertSeverity;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;
}

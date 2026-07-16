import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PageQueryDto } from '../../shared/dto/page-query.dto.js';

export const CHANNEL_TYPES = [
  'AMAZON_US',
  'AMAZON_EU',
  'AMAZON_JP',
  'AMAZON_AU',
  'SHOPIFY',
  'WOOCOMMERCE',
  'OZON',
  'OZON_PERFORMANCE',
  'MANUAL',
] as const;

export const SYNC_STATUSES = [
  'PENDING',
  'SYNCING',
  'SUCCESS',
  'FAILED',
  'DISCONNECTED',
] as const;

export class CreateChannelConnectionDto {
  @ApiProperty()
  @IsString()
  workspaceId: string;

  @ApiProperty({ enum: CHANNEL_TYPES })
  @IsString()
  @IsIn(CHANNEL_TYPES)
  provider: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  externalShopId?: string;

  @ApiProperty()
  @IsString()
  accessTokenEncrypted: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  refreshTokenEncrypted?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  tokenExpiresAt?: string;
}

export class UpdateChannelConnectionDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  externalShopId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  accessTokenEncrypted?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  refreshTokenEncrypted?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  tokenExpiresAt?: string;

  @ApiPropertyOptional({ enum: SYNC_STATUSES })
  @IsString()
  @IsIn(SYNC_STATUSES)
  @IsOptional()
  syncStatus?: string;
}

export class ListChannelsQueryDto extends PageQueryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;

  @ApiPropertyOptional({ enum: CHANNEL_TYPES })
  @IsString()
  @IsIn(CHANNEL_TYPES)
  @IsOptional()
  provider?: string;

  @ApiPropertyOptional({ enum: SYNC_STATUSES })
  @IsString()
  @IsIn(SYNC_STATUSES)
  @IsOptional()
  syncStatus?: string;
}

export class UpdateSyncStatusDto {
  @ApiProperty({ enum: SYNC_STATUSES })
  @IsString()
  @IsIn(SYNC_STATUSES)
  syncStatus: string;
}

export class ConnectOzonChannelDto {
  @ApiPropertyOptional({
    description:
      'Existing workspace to bind. If omitted, a new Ozon workspace is created.',
  })
  @IsString()
  @IsOptional()
  workspaceId?: string;

  @ApiPropertyOptional({ default: 'Ozon' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  workspaceName?: string;

  @ApiProperty({ description: 'Ozon seller Client-Id / seller id' })
  @IsString()
  @MaxLength(120)
  clientId: string;

  @ApiProperty({ description: 'Ozon seller Api-Key' })
  @IsString()
  @MaxLength(500)
  apiKey: string;

  @ApiPropertyOptional({ description: 'Human-readable external shop id/name' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  externalShopId?: string;
}

export class ConnectOzonPerformanceDto {
  @ApiProperty({ description: 'Existing Ozon workspace to bind.' })
  @IsString()
  workspaceId: string;

  @ApiProperty({ description: 'Ozon Performance service account client_id' })
  @IsString()
  @MaxLength(200)
  clientId: string;

  @ApiProperty({
    description: 'Ozon Performance service account client_secret',
  })
  @IsString()
  @MaxLength(1000)
  clientSecret: string;
}

export class OzonCustomerOverviewQueryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;

  @ApiPropertyOptional({ default: 30, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}

export class OzonCustomerHistoryQueryDto {
  @ApiProperty()
  @IsString()
  channelId: string;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 1000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  @IsOptional()
  limit?: number;
}

export class RequestOzonCustomerActionDto {
  @ApiProperty({
    enum: ['CHAT_REPLY', 'QUESTION_ANSWER', 'REVIEW_COMMENT'],
  })
  @IsString()
  @IsIn(['CHAT_REPLY', 'QUESTION_ANSWER', 'REVIEW_COMMENT'])
  action: 'CHAT_REPLY' | 'QUESTION_ANSWER' | 'REVIEW_COMMENT';

  @ApiProperty()
  @IsString()
  channelId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(3000)
  text: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  sku?: number;
}

export class OzonPerformanceOverviewQueryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;

  @ApiPropertyOptional()
  @IsISO8601({ strict: true })
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsISO8601({ strict: true })
  @IsOptional()
  dateTo?: string;
}

export class RequestOzonCampaignActionDto {
  @ApiProperty({ enum: ['ACTIVATE', 'DEACTIVATE', 'UPDATE_WEEKLY_BUDGET'] })
  @IsString()
  @IsIn(['ACTIVATE', 'DEACTIVATE', 'UPDATE_WEEKLY_BUDGET'])
  action: 'ACTIVATE' | 'DEACTIVATE' | 'UPDATE_WEEKLY_BUDGET';

  @ApiProperty()
  @IsString()
  channelId: string;

  @ApiPropertyOptional({ description: 'Weekly budget in RUB.' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  weeklyBudgetRub?: number;
}

export class SyncChannelProductsDto {
  @ApiPropertyOptional({
    description:
      'Maximum number of products to synchronize. Omit to synchronize the complete Ozon catalog up to the safety limit.',
    minimum: 1,
    maximum: 50000,
  })
  @IsInt()
  @Min(1)
  @Max(50000)
  @IsOptional()
  limit?: number;
}

export class SyncChannelOrdersDto {
  @ApiPropertyOptional({
    description: 'Inclusive ISO start time. Defaults to 30 days before now.',
  })
  @IsISO8601()
  @IsOptional()
  since?: string;

  @ApiPropertyOptional({
    description: 'Exclusive ISO end time. Defaults to now.',
  })
  @IsISO8601()
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({ default: 100, minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}

export class ListChannelOrdersQueryDto extends PageQueryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  channelId?: string;

  @ApiPropertyOptional({ enum: CHANNEL_TYPES })
  @IsString()
  @IsIn(CHANNEL_TYPES)
  @IsOptional()
  provider?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;
}

export class ListOzonRfbsReturnsQueryDto {
  @ApiPropertyOptional({ default: 30, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ description: 'Filter by Ozon posting number.' })
  @IsString()
  @MaxLength(160)
  @IsOptional()
  postingNumber?: string;
}

export class RequestOzonRfbsRefundDto {
  @ApiProperty({
    description:
      'Explicit acknowledgement that this request is for a full rFBS refund.',
  })
  @IsBoolean()
  confirmFullRefund: boolean;

  @ApiPropertyOptional({
    default: 0,
    minimum: 0,
    description: 'Ozon return_for_back_way amount in RUB.',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  returnForBackWay?: number;
}

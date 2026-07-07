import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PageQueryDto } from '../../shared/dto/page-query.dto.js';

export const CHANNEL_TYPES = [
  'AMAZON_US',
  'AMAZON_EU',
  'AMAZON_JP',
  'AMAZON_AU',
  'SHOPIFY',
  'WOOCOMMERCE',
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

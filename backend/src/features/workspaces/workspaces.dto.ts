import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { ChannelType } from '@prisma/client';
import { PageQueryDto } from '../../shared/dto/page-query.dto.js';

export const CHANNEL_TYPES = [
  'AMAZON_US',
  'AMAZON_EU',
  'AMAZON_JP',
  'AMAZON_AU',
  'SHOPIFY',
  'WOOCOMMERCE',
  'OZON',
  'MANUAL',
] as const;

export class CreateWorkspaceDto {
  @ApiProperty()
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ enum: CHANNEL_TYPES })
  @IsIn(CHANNEL_TYPES)
  channelType: ChannelType;

  @ApiPropertyOptional({ example: 'US' })
  @IsString()
  @MaxLength(30)
  @IsOptional()
  marketplace?: string;

  @ApiPropertyOptional({ default: 'USD' })
  @IsString()
  @MaxLength(3)
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ default: 'Asia/Shanghai' })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  timezone?: string;
}

export class UpdateWorkspaceDto {
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(100)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'US' })
  @IsString()
  @MaxLength(30)
  @IsOptional()
  marketplace?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(3)
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(50)
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'ARCHIVED'] })
  @IsIn(['ACTIVE', 'ARCHIVED'])
  @IsOptional()
  status?: string;
}

export class ListWorkspacesQueryDto extends PageQueryDto {}

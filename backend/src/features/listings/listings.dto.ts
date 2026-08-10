import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { ListingStatus } from '@prisma/client';
import { PageQueryDto } from '../../shared/dto/page-query.dto.js';

export const LISTING_STATUSES = [
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'PUBLISHED',
  'REJECTED',
  'ARCHIVED',
] as const;

export const LISTING_PLATFORMS = [
  'amazon',
  'shopify',
  'etsy',
  'ebay',
  'ozon',
  'temu',
] as const;

export class GenerateListingDto {
  @ApiProperty()
  @IsString()
  workspaceId: string;

  @ApiProperty({ description: 'Product name to write the listing for' })
  @IsString()
  @MaxLength(300)
  productName: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  keywords?: string[];

  @ApiProperty({ enum: LISTING_PLATFORMS })
  @IsIn(LISTING_PLATFORMS)
  platform: string;

  @ApiPropertyOptional({ example: 'professional' })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  tone?: string;

  @ApiPropertyOptional({ description: 'Link the draft to an existing product' })
  @IsString()
  @IsOptional()
  productId?: string;
}

export class UpdateListingDto {
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  bullets?: string[];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  seoTags?: string[];

  @ApiPropertyOptional({ enum: LISTING_STATUSES })
  @IsIn(LISTING_STATUSES)
  @IsOptional()
  status?: ListingStatus;
}

export class ListListingsQueryDto extends PageQueryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;

  @ApiPropertyOptional({ enum: LISTING_STATUSES })
  @IsIn(LISTING_STATUSES)
  @IsOptional()
  status?: ListingStatus;
}

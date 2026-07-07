import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { ProductStatus } from '@prisma/client';
import { PageQueryDto } from '../../shared/dto/page-query.dto.js';

export const PRODUCT_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'ARCHIVED',
  'DELETED',
] as const;

export class CreateProductDto {
  @ApiProperty()
  @IsString()
  workspaceId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(300)
  title: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(100)
  @IsOptional()
  sku?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(100)
  @IsOptional()
  asinOrExternalId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  images?: string[];

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  cost?: number;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @ApiPropertyOptional({ default: 'USD' })
  @IsString()
  @MaxLength(3)
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ enum: PRODUCT_STATUSES })
  @IsIn(PRODUCT_STATUSES)
  @IsOptional()
  status?: ProductStatus;

  @ApiPropertyOptional({ type: Object })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class UpdateProductDto {
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(300)
  @IsOptional()
  title?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(100)
  @IsOptional()
  sku?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(100)
  @IsOptional()
  asinOrExternalId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  images?: string[];

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  cost?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(3)
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ enum: PRODUCT_STATUSES })
  @IsIn(PRODUCT_STATUSES)
  @IsOptional()
  status?: ProductStatus;

  @ApiPropertyOptional({ type: Object })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class ListProductsQueryDto extends PageQueryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;

  @ApiPropertyOptional({ enum: PRODUCT_STATUSES })
  @IsIn(PRODUCT_STATUSES)
  @IsOptional()
  status?: ProductStatus;

  @ApiPropertyOptional({ description: 'Title/SKU substring search' })
  @IsString()
  @IsOptional()
  search?: string;
}

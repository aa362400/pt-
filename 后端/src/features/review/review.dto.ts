import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export const REVIEW_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'REWORK',
] as const;

export const REVIEW_ENTITY_TYPES = [
  'AGENT_RUN',
  'IMAGE_GENERATION',
  'LISTING_DRAFT',
  'PRODUCT_RESEARCH',
  'SUPPLY_PLAN',
] as const;

export class CreateReviewTaskDto {
  @ApiProperty({ enum: REVIEW_ENTITY_TYPES })
  @IsIn(REVIEW_ENTITY_TYPES)
  entityType: string;

  @ApiProperty()
  @IsString()
  entityId: string;

  @ApiPropertyOptional({ description: 'Consistency score 0-100' })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  score?: number;

  @ApiPropertyOptional({ description: 'Approval threshold', default: 60 })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  threshold?: number;
}

export class UpdateReviewDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED', 'REWORK'] })
  @IsIn(['APPROVED', 'REJECTED', 'REWORK'])
  status: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}

export const MANUAL_PRICING_ACTIONS = [
  'SAVE_DRAFT',
  'SUBMIT_COMPLETE',
  'SUBMIT_INCOMPLETE',
] as const;

export class UpdateManualPricingDto {
  @ApiProperty({ enum: MANUAL_PRICING_ACTIONS })
  @IsIn(MANUAL_PRICING_ACTIONS)
  action: (typeof MANUAL_PRICING_ACTIONS)[number];

  @ApiPropertyOptional({ example: 'CNY', description: 'ISO 4217 币种代码' })
  @IsString()
  @Matches(/^[A-Z]{3}$/u)
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 1_000_000_000 })
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1_000_000_000)
  @IsOptional()
  procurementCost?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1_000_000_000 })
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1_000_000_000)
  @IsOptional()
  domesticShippingCost?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1_000_000_000 })
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1_000_000_000)
  @IsOptional()
  internationalShippingCost?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  @IsOptional()
  ozonCommissionRatePercent?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  @IsOptional()
  paymentCollectionFeeRatePercent?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1_000_000_000 })
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1_000_000_000)
  @IsOptional()
  warehousingCost?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  @IsOptional()
  advertisingRatePercent?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  @IsOptional()
  refundLossRatePercent?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  @IsOptional()
  taxRatePercent?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1_000_000_000 })
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1_000_000_000)
  @IsOptional()
  packagingCost?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  @IsOptional()
  fxBufferRatePercent?: number;

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsString()
  @MaxLength(4000)
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsString()
  @MaxLength(4000)
  @IsOptional()
  riskEvidence?: string;
}

export class ReviewListQueryDto {
  @ApiPropertyOptional({ enum: REVIEW_STATUSES })
  @IsString()
  @IsIn(REVIEW_STATUSES)
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ enum: REVIEW_ENTITY_TYPES })
  @IsString()
  @IsIn(REVIEW_ENTITY_TYPES)
  @IsOptional()
  entityType?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;
}

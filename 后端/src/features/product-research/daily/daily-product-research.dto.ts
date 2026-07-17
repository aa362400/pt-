import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PageQueryDto } from '../../../shared/dto/page-query.dto.js';
import {
  RESEARCH_PRICING_MODES,
  type ResearchPricingMode,
} from './contracts/daily-product-research.contract.js';

export class ManualDailyResearchRunDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;

  @ApiPropertyOptional({
    description: 'Business date in the selected timezone',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsOptional()
  businessDate?: string;

  @ApiPropertyOptional({ default: 'Asia/Shanghai' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 300, default: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300)
  @IsOptional()
  candidateLimit?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 10, default: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  @IsOptional()
  topLimit?: number;

  @ApiPropertyOptional({
    enum: RESEARCH_PRICING_MODES,
    default: 'AUTO',
    description:
      'AUTO requires verified economics evidence. MANUAL keeps candidates pending human pricing and never authorizes publishing.',
  })
  @IsIn(RESEARCH_PRICING_MODES)
  @IsOptional()
  pricingMode?: ResearchPricingMode;

  @ApiPropertyOptional({
    description: 'Customer-confirmed discovery seed queries. The read-only connector expands them into auditable marketplace searches.',
    type: 'array',
    maxItems: 8,
  })
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  @IsOptional()
  seedQueries?: string[];

  @ApiPropertyOptional({
    description:
      'Validated manual/CSV candidate rows. Values are evidence inputs, not model output.',
    type: 'array',
  })
  @IsArray()
  @ArrayMaxSize(300)
  @IsOptional()
  inputCandidates?: unknown;
}

export class ListDailyResearchRunsQueryDto extends PageQueryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;

  @ApiPropertyOptional({
    enum: ['PENDING', 'RUNNING', 'PARTIAL', 'COMPLETED', 'FAILED', 'CANCELLED'],
  })
  @IsIn([
    'PENDING',
    'RUNNING',
    'PARTIAL',
    'COMPLETED',
    'FAILED',
    'CANCELLED',
    'PAUSED',
    'STOPPED',
  ])
  @IsOptional()
  status?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  to?: string;
}

export class ListDailyCandidatesQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ['TEST_NOW', 'WATCH', 'HOLD', 'REJECT'] })
  @IsIn(['TEST_NOW', 'WATCH', 'HOLD', 'REJECT'])
  @IsOptional()
  decision?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(200)
  @IsOptional()
  search?: string;
}

export class CreateScoringVersionDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  reason: string;

  @ApiProperty()
  @IsObject()
  weights: Record<string, number>;

  @ApiProperty()
  @IsObject()
  thresholds: Record<string, unknown>;
}

export class ScoringVersionActionDto {
  @ApiProperty()
  @IsString()
  @MaxLength(500)
  reason: string;
}

export class UpdateDailyResearchScheduleDto {
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional({ default: '08:00' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  @IsOptional()
  localTime?: string;

  @ApiPropertyOptional({ default: 'Asia/Shanghai' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;

  @ApiPropertyOptional({ enum: RESEARCH_PRICING_MODES, default: 'MANUAL' })
  @IsIn(RESEARCH_PRICING_MODES)
  @IsOptional()
  pricingMode?: ResearchPricingMode;
}

export class CandidateDecisionDto {
  @ApiProperty()
  @IsString()
  @MaxLength(500)
  reason: string;
}

export const PRODUCT_FEEDBACK_EVENT_TYPES = [
  'SAMPLE_REQUESTED',
  'SAMPLE_COMPLETED',
  'SAMPLE_REJECTED',
  'DEVELOPMENT_TASK_CREATED',
  'LISTING_DRAFT_CREATED',
  'LISTING_APPROVED',
  'LISTING_PUBLISHED',
  'IMPRESSION',
  'CLICK',
  'FAVORITE',
  'ADD_TO_CART',
  'ORDER_CREATED',
  'ORDER_CANCELLED',
  'ORDER_REFUNDED',
  'AD_SPEND',
  'REVENUE',
  'COST_ADJUSTMENT',
  'ACTUAL_PROFIT',
  'RISK_REVIEW_CONFIRMED',
  'RISK_REVIEW_DISMISSED',
] as const;

export class CreateProductFeedbackDto {
  @ApiProperty({ enum: PRODUCT_FEEDBACK_EVENT_TYPES })
  @IsIn(PRODUCT_FEEDBACK_EVENT_TYPES)
  eventType: (typeof PRODUCT_FEEDBACK_EVENT_TYPES)[number];

  @ApiProperty()
  @IsDateString()
  eventAt: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @IsOptional()
  value?: number;

  @ApiPropertyOptional({ example: 'CNY' })
  @Matches(/^[A-Z]{3}$/)
  @IsOptional()
  currency?: string;

  @ApiProperty({
    enum: ['MANUAL', 'INTERNAL', 'OZON', 'ETSY', 'AMAZON', 'TEMU'],
  })
  @IsIn(['MANUAL', 'INTERNAL', 'OZON', 'ETSY', 'AMAZON', 'TEMU'])
  source: string;

  @ApiProperty({ description: 'Stable source event ID used for idempotency' })
  @IsString()
  @MaxLength(200)
  externalReference: string;

  @ApiPropertyOptional({ enum: ['VERIFIED', 'ESTIMATED', 'MANUAL'] })
  @IsIn(['VERIFIED', 'ESTIMATED', 'MANUAL'])
  @IsOptional()
  quality?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(100)
  @IsOptional()
  reasonCode?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  note?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  productId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  listingDraftId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  productLaunchId?: string;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class ProductFeedbackSummaryQueryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  to?: string;
}

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
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const PAGE_TYPES = ['SEARCH', 'CATEGORY', 'PRODUCT'] as const;

export class MarketObservationItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  externalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  offerId?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  title: string;

  @ApiProperty()
  @IsUrl({ require_protocol: true })
  @MaxLength(2_000)
  url: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2_000)
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  sellerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100_000_000)
  currentPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100_000_000)
  originalPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  reviewCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  displayedSalesText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000)
  position?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  badges?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  deliveryText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  promotionText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sponsored?: boolean;
}

export class CreateMarketObservationDto {
  @ApiProperty({ enum: ['OZON_PUBLIC_PAGE'] })
  @IsIn(['OZON_PUBLIC_PAGE'])
  source: 'OZON_PUBLIC_PAGE';

  @ApiProperty({ enum: PAGE_TYPES })
  @IsIn(PAGE_TYPES)
  pageType: (typeof PAGE_TYPES)[number];

  @ApiProperty()
  @IsUrl({ require_protocol: true })
  @MaxLength(2_000)
  pageUrl: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  query?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  category?: string;

  @ApiProperty()
  @IsDateString()
  capturedAt: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  locale?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  pageTitle?: string;

  @ApiProperty({ example: 'ozon-parser/v1' })
  @IsIn(['ozon-parser/v1'])
  parserVersion: 'ozon-parser/v1';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  extensionVersion?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1)
  confidence?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  workspaceId?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  pageEvidence?: Record<string, unknown>;

  @ApiProperty({ type: [MarketObservationItemDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => MarketObservationItemDto)
  items: MarketObservationItemDto[];
}

export class ListMarketObservationsQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class RecordOpportunityDecisionDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED', 'RESEARCHING'] })
  @IsIn(['APPROVED', 'REJECTED', 'RESEARCHING'])
  status: 'APPROVED' | 'REJECTED' | 'RESEARCHING';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  reason?: string;
}

export class CreateBusinessOutcomeDto {
  @ApiProperty({ enum: ['MANUAL', 'OZON_READBACK'] })
  @IsIn(['MANUAL', 'OZON_READBACK'])
  source: 'MANUAL' | 'OZON_READBACK';

  @ApiProperty()
  @IsDateString()
  periodStart: string;

  @ApiProperty()
  @IsDateString()
  periodEnd: string;

  @ApiProperty()
  @IsObject()
  metrics: Record<string, unknown>;

  @ApiProperty()
  @IsObject()
  evidence: Record<string, unknown>;

  @ApiProperty({ minimum: 0, maximum: 1 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1)
  confidence: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  listingDraftId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  publishSnapshotId?: string;
}

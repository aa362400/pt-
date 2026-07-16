import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PageQueryDto } from '../../shared/dto/page-query.dto.js';

export class CalculateProfitDto {
  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  salePrice: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  productCost: number;

  @ApiProperty({ description: 'Packaging cost; pass 0 explicitly when none' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  packagingCost?: number;

  @ApiProperty({
    description:
      'Marketplace or last-mile shipping cost; pass 0 explicitly when none',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  shippingCost?: number;

  @ApiProperty({
    description: 'Domestic transport cost; pass 0 explicitly when none',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  domesticTransportCost?: number;

  @ApiProperty({
    description: 'International logistics cost; pass 0 explicitly when none',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  internationalLogisticsCost?: number;

  @ApiProperty({ description: 'Marketplace fee; pass 0 explicitly when none' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  platformFee?: number;

  @ApiProperty({ description: 'Payment fee; pass 0 explicitly when none' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  paymentFee?: number;

  @ApiProperty({ description: 'Advertising cost; pass 0 explicitly when none' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  adCost?: number;

  @ApiProperty({ description: 'Storage cost; pass 0 explicitly when none' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  storageCost?: number;

  @ApiProperty({ description: 'Tax cost; pass 0 explicitly when none' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxCost?: number;

  @ApiProperty({
    description: 'Refund and loss reserve; pass 0 explicitly when none',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  refundLossReserve?: number;

  @ApiProperty({
    description:
      'Exchange-rate volatility reserve; pass 0 explicitly when none',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  exchangeRateRiskReserve?: number;

  @ApiProperty({ description: 'Other cost; pass 0 explicitly when none' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  otherCost?: number;

  @ApiPropertyOptional({ default: 'USD' })
  @IsString()
  @MaxLength(3)
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  productId?: string;
}

export class ListProfitCalcsQueryDto extends PageQueryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  productId?: string;
}

export class CalculateOzonPricingDto {
  @ApiPropertyOptional({ enum: ['calculate', 'evaluate'] })
  @IsIn(['calculate', 'evaluate'])
  @IsOptional()
  mode?: 'calculate' | 'evaluate';

  @ApiPropertyOptional({
    description: 'Caller row/SKU identifier for batch traceability',
  })
  @IsString()
  @MaxLength(160)
  @IsOptional()
  itemId?: string;

  @ApiPropertyOptional({ description: 'Product title from the pricing sheet' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  productTitle?: string;

  @ApiPropertyOptional({ description: 'Seller SKU from the pricing sheet' })
  @IsString()
  @MaxLength(160)
  @IsOptional()
  sku?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  category: string;

  @ApiProperty({
    enum: ['express', 'standard', 'economy'],
  })
  @IsIn(['express', 'standard', 'economy'])
  logistics?: 'express' | 'standard' | 'economy';

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  purchaseCost: number;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  otherCost?: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  weightGram: number;

  @ApiPropertyOptional({
    description:
      '0-1 fraction or 0-100 percent; omitted values use the versioned engine rule',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  targetMarginRate?: number;

  @ApiPropertyOptional({
    description:
      '0-1 fraction or 0-100 percent; omitted values use the versioned engine rule',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  advertisingRate?: number;

  @ApiPropertyOptional({
    description:
      '0-1 fraction or 0-100 percent; omitted values use the versioned engine rule',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  fixedCostRate?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @IsOptional()
  observedSalePriceCny?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  competitorPriceCny?: number;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  competitorUrl?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  sourceUrl?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  note1?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  note2?: string;

  @ApiPropertyOptional({ description: 'Immutable source workbook filename' })
  @IsString()
  @MaxLength(260)
  @IsOptional()
  sourceFileName?: string;

  @ApiPropertyOptional({ description: 'SHA-256 of the imported workbook' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  sourceFileSha256?: string;

  @ApiPropertyOptional({ description: '1-based source workbook row number' })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  sourceExcelRow?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  declaredWeightGram?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  actualWeightGram?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @IsOptional()
  exchangeRate?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @IsOptional()
  listingMultiplier?: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  lengthCm?: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  widthCm?: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  heightCm?: number;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  hasBattery?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  hasMsds?: boolean;

  @ApiPropertyOptional({
    default: true,
    description: 'Persist an auditable tenant calculation record',
  })
  @IsBoolean()
  @IsOptional()
  persist?: boolean;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  productId?: string;
}

export class BatchCalculateOzonPricingDto {
  @ApiProperty({ type: [CalculateOzonPricingDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CalculateOzonPricingDto)
  items: CalculateOzonPricingDto[];

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  persist?: boolean;
}

export class ImportOzonPricingWorkbookDto {
  @ApiProperty({ description: 'Original .xlsx filename' })
  @IsString()
  @MaxLength(260)
  filename: string;

  @ApiProperty({ description: 'Base64 or data-URL encoded .xlsx bytes' })
  @IsString()
  @MaxLength(12 * 1024 * 1024)
  dataBase64: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  persist?: boolean;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  productId?: string;
}

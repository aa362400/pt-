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
  @Min(0)
  salePrice: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  productCost: number;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  packagingCost?: number;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  shippingCost?: number;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  platformFee?: number;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  paymentFee?: number;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  adCost?: number;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  storageCost?: number;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
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

  @ApiPropertyOptional({
    enum: ['express', 'standard', 'economy'],
    default: 'standard',
  })
  @IsIn(['express', 'standard', 'economy'])
  @IsOptional()
  logistics?: 'express' | 'standard' | 'economy';

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
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
    default: 0.2,
    description: '0-1 fraction or 0-100 percent',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  targetMarginRate?: number;

  @ApiPropertyOptional({
    default: 0.2,
    description: '0-1 fraction or 0-100 percent',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  advertisingRate?: number;

  @ApiPropertyOptional({
    default: 0.085,
    description: '0-1 fraction or 0-100 percent',
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

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @IsOptional()
  lengthCm?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @IsOptional()
  widthCm?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @IsOptional()
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

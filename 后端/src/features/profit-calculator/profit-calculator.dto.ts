import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
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

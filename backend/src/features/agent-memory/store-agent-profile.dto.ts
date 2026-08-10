import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateStoreAgentProfileDto {
  @ApiPropertyOptional({ type: [String], maxItems: 30 })
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  @IsOptional()
  targetCategories?: string[];

  @ApiPropertyOptional({ type: [String], maxItems: 30 })
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  @IsOptional()
  forbiddenTerms?: string[];

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  minimumProfitMargin?: number | null;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  notes?: string | null;
}

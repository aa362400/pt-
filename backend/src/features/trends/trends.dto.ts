import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../shared/dto/page-query.dto.js';

export class AnalyzeTrendsDto {
  @ApiProperty({ example: 'home & kitchen' })
  @IsString()
  @MaxLength(100)
  category: string;

  @ApiProperty({ example: 'amazon_us' })
  @IsString()
  @MaxLength(50)
  marketplace: string;

  @ApiPropertyOptional({ example: '90d' })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  timeframe?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;
}

export class ListTrendsQueryDto extends PageQueryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  keyword?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;

  @ApiPropertyOptional({ example: 'amazon_us' })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  marketplace?: string;

  @ApiPropertyOptional({ example: '90d' })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  timeframe?: string;
}

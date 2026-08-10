import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PageQueryDto } from '../../shared/dto/page-query.dto.js';

export class CreateKeywordReportDto {
  @ApiProperty({ type: [String], description: 'Seed keywords' })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  seedKeywords: string[];

  @ApiProperty({ example: 'amazon_us' })
  @IsString()
  @MaxLength(50)
  marketplace: string;

  @ApiPropertyOptional({ default: 'US' })
  @IsString()
  @MaxLength(5)
  @IsOptional()
  country?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;
}

export class ListKeywordReportsQueryDto extends PageQueryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;
}

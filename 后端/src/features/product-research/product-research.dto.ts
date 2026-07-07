import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../shared/dto/page-query.dto.js';

export class CreateResearchReportDto {
  @ApiProperty({ description: 'Product or niche to research' })
  @IsString()
  @MaxLength(300)
  query: string;

  @ApiProperty({ example: 'amazon_us' })
  @IsString()
  @MaxLength(50)
  platform: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;
}

export class ListResearchReportsQueryDto extends PageQueryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;
}

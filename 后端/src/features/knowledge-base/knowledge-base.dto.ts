import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { DocumentVisibility } from '@prisma/client';
import { PageQueryDto } from '../../shared/dto/page-query.dto.js';

export const DOC_VISIBILITIES = [
  'PRIVATE',
  'WORKSPACE',
  'ORGANIZATION',
] as const;

export class CreateKnowledgeDocDto {
  @ApiProperty()
  @IsString()
  @MaxLength(300)
  title: string;

  @ApiProperty()
  @IsString()
  content: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ enum: DOC_VISIBILITIES, default: 'ORGANIZATION' })
  @IsIn(DOC_VISIBILITIES)
  @IsOptional()
  visibility?: DocumentVisibility;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;

  @ApiPropertyOptional({ description: 'Linked uploaded file asset id' })
  @IsString()
  @IsOptional()
  fileAssetId?: string;
}

export class UpdateKnowledgeDocDto {
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(300)
  @IsOptional()
  title?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  content?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ enum: DOC_VISIBILITIES })
  @IsIn(DOC_VISIBILITIES)
  @IsOptional()
  visibility?: DocumentVisibility;
}

export class ListKnowledgeDocsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Title substring search' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by tag' })
  @IsString()
  @IsOptional()
  tag?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;
}

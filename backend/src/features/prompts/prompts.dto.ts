import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../shared/dto/page-query.dto.js';

export class CreatePromptDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 'listing' })
  @IsString()
  @MaxLength(50)
  category: string;

  @ApiProperty({ description: 'Prompt body, may contain {{variables}}' })
  @IsString()
  content: string;

  @ApiPropertyOptional({ type: [String], description: 'Variable names' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  variables?: string[];
}

export class UpdatePromptDto {
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(200)
  @IsOptional()
  title?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(50)
  @IsOptional()
  category?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  content?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  variables?: string[];
}

export class ListPromptsQueryDto extends PageQueryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;
}

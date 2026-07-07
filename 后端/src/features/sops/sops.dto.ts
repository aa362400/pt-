import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { SopStatus } from '@prisma/client';
import { PageQueryDto } from '../../shared/dto/page-query.dto.js';

export const SOP_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;

export class CreateSopDto {
  @ApiProperty()
  @IsString()
  @MaxLength(300)
  title: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    type: [Object],
    description: 'Ordered step objects, e.g. { title, detail }',
  })
  @IsArray()
  @IsOptional()
  steps?: Array<Record<string, unknown>>;
}

export class UpdateSopDto {
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(300)
  @IsOptional()
  title?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ type: [Object] })
  @IsArray()
  @IsOptional()
  steps?: Array<Record<string, unknown>>;
}

export class ListSopsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: SOP_STATUSES })
  @IsIn(SOP_STATUSES)
  @IsOptional()
  status?: SopStatus;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export const REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'REWORK'] as const;

export const REVIEW_ENTITY_TYPES = [
  'AGENT_RUN',
  'IMAGE_GENERATION',
  'LISTING_DRAFT',
  'PRODUCT_RESEARCH',
] as const;

export class CreateReviewTaskDto {
  @ApiProperty({ enum: REVIEW_ENTITY_TYPES })
  @IsIn(REVIEW_ENTITY_TYPES)
  entityType: string;

  @ApiProperty()
  @IsString()
  entityId: string;

  @ApiPropertyOptional({ description: 'Consistency score 0-100' })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  score?: number;

  @ApiPropertyOptional({ description: 'Approval threshold', default: 60 })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  threshold?: number;
}

export class UpdateReviewDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED', 'REWORK'] })
  @IsIn(['APPROVED', 'REJECTED', 'REWORK'])
  status: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}

export class ReviewListQueryDto {
  @ApiPropertyOptional({ enum: REVIEW_STATUSES })
  @IsString()
  @IsIn(REVIEW_STATUSES)
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ enum: REVIEW_ENTITY_TYPES })
  @IsString()
  @IsIn(REVIEW_ENTITY_TYPES)
  @IsOptional()
  entityType?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;
}

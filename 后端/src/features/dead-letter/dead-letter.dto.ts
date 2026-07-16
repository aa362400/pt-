import { Transform, Type } from 'class-transformer';
import {
  DeadLetterClassification,
  DeadLetterResolutionStatus,
} from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ListDeadLettersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsEnum(DeadLetterClassification)
  classification?: DeadLetterClassification;

  @IsOptional()
  @IsEnum(DeadLetterResolutionStatus)
  resolutionStatus?: DeadLetterResolutionStatus;
}

export class ClassifyDeadLetterDto {
  @IsEnum(DeadLetterClassification)
  classification!: DeadLetterClassification;

  @IsBoolean()
  replayEligible!: boolean;

  @IsString()
  @MinLength(8)
  reason!: string;
}

export class ResolveDeadLetterDto {
  @IsString()
  @MinLength(8)
  note!: string;
}

export class ReplayDeadLetterDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(16)
  @MaxLength(128)
  idempotencyKey!: string;
}

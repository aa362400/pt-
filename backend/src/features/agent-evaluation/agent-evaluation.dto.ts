import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AgentType, PromptVersionStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateFeedbackSignalDto {
  @ApiProperty({ example: 'USER_CORRECTION' })
  @IsString()
  @MaxLength(80)
  signalType: string;

  @ApiProperty({ example: 'APPROVAL_UI' })
  @IsString()
  @MaxLength(80)
  source: string;

  @ApiProperty()
  @IsString()
  @MaxLength(240)
  externalReference: string;

  @ApiProperty()
  @IsObject()
  value: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  runId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  approvalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  listingId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  snapshotId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  promptVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  modelVersion?: string;

  @ApiPropertyOptional({ enum: AgentType })
  @IsOptional()
  @IsEnum(AgentType)
  agentType?: AgentType;
}

export class ListFeedbackSignalsQueryDto {
  @ApiPropertyOptional({ enum: AgentType })
  @IsOptional()
  @IsEnum(AgentType)
  agentType?: AgentType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  signalType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  runId?: string;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class AgentEvalWindowDto {
  @ApiProperty({ enum: AgentType })
  @IsEnum(AgentType)
  agentType: AgentType;

  @ApiProperty()
  @IsDateString()
  from: string;

  @ApiProperty()
  @IsDateString()
  to: string;
}

export class CreatePromptVersionDto {
  @ApiProperty({ enum: AgentType })
  @IsEnum(AgentType)
  agentType: AgentType;

  @ApiProperty()
  @IsString()
  @MaxLength(80)
  version: string;

  @ApiProperty({ description: 'Existing tenant PromptTemplate id' })
  @IsString()
  @MaxLength(128)
  templateRef: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdatePromptVersionStatusDto {
  @ApiProperty({ enum: PromptVersionStatus })
  @IsEnum(PromptVersionStatus)
  status: PromptVersionStatus;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  @MaxLength(1_000)
  reason: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 0.05 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(0.05)
  routingWeight?: number;
}

export class CreateBusinessOutcomeDto {
  @ApiProperty()
  @IsString()
  @MaxLength(80)
  source: string;

  @ApiProperty()
  @IsString()
  @MaxLength(240)
  externalReference: string;

  @ApiProperty()
  @IsDateString()
  periodStart: string;

  @ApiProperty()
  @IsDateString()
  periodEnd: string;

  @ApiProperty()
  @IsObject()
  metrics: Record<string, unknown>;

  @ApiProperty()
  @IsObject()
  evidence: Record<string, unknown>;

  @ApiProperty({ minimum: 0, maximum: 1 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1)
  confidence: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  runId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  listingId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  snapshotId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productId?: string;
}

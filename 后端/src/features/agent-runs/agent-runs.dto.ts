import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { AgentType } from '@prisma/client';

export const AGENT_TYPES = [
  'PRODUCT_RESEARCHER',
  'LISTING_OPTIMIZER',
  'ADVERTISING_STRATEGIST',
  'PROFIT_ANALYST',
  'CUSTOMER_INSIGHT',
  'CONTENT_WRITER',
  'KEYWORD_EXPLORER',
  'GENERAL_ASSISTANT',
  'IMAGE_CREATIVE',
] as const;

export class CreateAgentRunDto {
  @ApiProperty({ enum: AGENT_TYPES, description: 'Type of agent to run' })
  @IsIn(AGENT_TYPES)
  agentType: AgentType;

  @ApiPropertyOptional({ description: 'Workspace to attribute the run to' })
  @IsString()
  @IsOptional()
  workspaceId?: string;

  @ApiProperty({
    description: 'Agent input payload (shape depends on agentType)',
    type: Object,
  })
  @IsObject()
  input: Record<string, unknown>;
}

export class AgentRunEventDto {
  @ApiProperty({ description: 'Agent-side run ID (echo)' })
  @IsString()
  runId: string;

  @ApiProperty({ enum: ['running', 'completed', 'failed'] })
  @IsIn(['running', 'completed', 'failed'])
  status: 'running' | 'completed' | 'failed';

  @ApiPropertyOptional({ description: 'Current pipeline stage' })
  @IsString()
  @IsOptional()
  stage?: string | null;

  @ApiPropertyOptional({ description: 'Human-readable progress message' })
  @IsString()
  @IsOptional()
  message?: string | null;

  @ApiPropertyOptional({ description: 'Event timestamp (ISO8601)' })
  @IsString()
  @IsOptional()
  timestamp?: string;
}

export class ListAgentRunsQueryDto {
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

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { AgentType } from '@prisma/client';
import { AgentLifecycleEvent } from './agent-state-machine.js';

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
  'PLANNER',
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

  @ApiPropertyOptional({
    description:
      'Client-generated idempotency key for a repeated create request',
    maxLength: 128,
  })
  @IsString()
  @IsOptional()
  clientRequestId?: string;
}

export class AgentRunEventDto {
  @ApiProperty({ description: 'Organization owning the agent run' })
  @IsString()
  organizationId: string;

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

export class AgentLifecycleEventDto {
  @ApiProperty({ description: 'Organization owning the agent run' })
  @IsString()
  organizationId: string;

  @ApiProperty({ description: 'Agent-side run ID (echo)' })
  @IsString()
  runId: string;

  @ApiProperty({ enum: AgentLifecycleEvent })
  @IsIn(Object.values(AgentLifecycleEvent))
  event: AgentLifecycleEvent;

  @ApiProperty({ description: 'Stable idempotency key for this event' })
  @IsString()
  @MaxLength(256)
  eventKey: string;

  @ApiPropertyOptional({ type: Object })
  @IsObject()
  @IsOptional()
  payload?: Record<string, unknown>;

  @ApiPropertyOptional({ minimum: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  attempt?: number;

  @ApiPropertyOptional({ description: 'Current logical step key' })
  @IsString()
  @MaxLength(128)
  @IsOptional()
  currentStep?: string;
}

export class CancelAgentRunDto {
  @ApiProperty({
    description: 'Client-generated idempotency key for this cancel request',
    maxLength: 128,
  })
  @IsString()
  @MaxLength(128)
  requestId: string;
}

export class RetryAgentRunDto {
  @ApiProperty({
    description: 'Client-generated idempotency key for this retry request',
    maxLength: 128,
  })
  @IsString()
  @MaxLength(128)
  requestId: string;
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

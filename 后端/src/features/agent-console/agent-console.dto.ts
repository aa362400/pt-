import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CreateSessionDto,
  PostMessageDto,
} from '../assistant/assistant.dto.js';

export class CreateAgentConversationDto extends CreateSessionDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 4, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  autonomyLevel?: number;

  @ApiPropertyOptional({ type: [String], default: [] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  allowedDomains?: string[];

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}

export class AgentConversationMessageDto extends PostMessageDto {}

export class AgentPlanStepDto {
  @ApiProperty()
  @IsString()
  @MaxLength(160)
  toolName: string;

  @ApiPropertyOptional({ type: Object, default: {} })
  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;
}

export class CreateAgentPlanDto {
  @ApiProperty()
  @IsString()
  @MaxLength(1_000)
  goal: string;

  @ApiProperty({ type: [AgentPlanStepDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AgentPlanStepDto)
  steps: AgentPlanStepDto[];
}

export class ListAgentConversationsQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

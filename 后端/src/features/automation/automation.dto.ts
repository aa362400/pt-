import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { AutomationFlowStatus, TriggerType } from '@prisma/client';
import { PageQueryDto } from '../../shared/dto/page-query.dto.js';

export const TRIGGER_TYPES = [
  'SCHEDULE',
  'WEBHOOK',
  'CONDITION',
  'EVENT',
  'MANUAL',
] as const;

export const FLOW_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'ERROR',
  'ARCHIVED',
] as const;

export class CreateFlowDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ enum: TRIGGER_TYPES })
  @IsIn(TRIGGER_TYPES)
  triggerType: TriggerType;

  @ApiPropertyOptional({ type: Object })
  @IsObject()
  @IsOptional()
  triggerConfig?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [Object], description: 'Ordered step objects' })
  @IsArray()
  @IsOptional()
  steps?: Array<Record<string, unknown>>;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;
}

export class UpdateFlowDto {
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(200)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ enum: FLOW_STATUSES })
  @IsIn(FLOW_STATUSES)
  @IsOptional()
  status?: AutomationFlowStatus;

  @ApiPropertyOptional({ type: Object })
  @IsObject()
  @IsOptional()
  triggerConfig?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [Object] })
  @IsArray()
  @IsOptional()
  steps?: Array<Record<string, unknown>>;
}

export class ListFlowsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: FLOW_STATUSES })
  @IsIn(FLOW_STATUSES)
  @IsOptional()
  status?: AutomationFlowStatus;
}

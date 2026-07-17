import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
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

export const AUTOMATION_FLOW_DELETE_ERROR_CODES = {
  draftOnly: 'AUTOMATION_FLOW_DELETE_DRAFT_ONLY',
  evidenceExists: 'AUTOMATION_FLOW_EVIDENCE_EXISTS',
  concurrentChange: 'AUTOMATION_FLOW_DELETE_CONCURRENT_CHANGE',
  notFound: 'AUTOMATION_FLOW_NOT_FOUND',
} as const;

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
  @Type(() => Object)
  @IsArray()
  @IsObject({ each: true })
  @IsOptional()
  steps?: Array<Record<string, unknown>>;

  @ApiPropertyOptional({ enum: FLOW_STATUSES })
  @IsIn(FLOW_STATUSES)
  @IsOptional()
  status?: AutomationFlowStatus;

  @ApiPropertyOptional({ description: 'When a scheduled flow should run next' })
  @IsDateString()
  @IsOptional()
  nextRunAt?: string;

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

  @ApiPropertyOptional({ enum: TRIGGER_TYPES })
  @IsIn(TRIGGER_TYPES)
  @IsOptional()
  triggerType?: TriggerType;

  @ApiPropertyOptional({ type: Object })
  @IsObject()
  @IsOptional()
  triggerConfig?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [Object] })
  @Type(() => Object)
  @IsArray()
  @IsObject({ each: true })
  @IsOptional()
  steps?: Array<Record<string, unknown>>;

  @ApiPropertyOptional({ description: 'When a scheduled flow should run next' })
  @IsDateString()
  @IsOptional()
  nextRunAt?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;
}

export class TriggerFlowDto {
  @ApiProperty({
    description: 'Operator reason recorded in the immutable run snapshot',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason: string;

  @ApiProperty({
    description: 'Client-generated idempotency key for this trigger request',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(16)
  @MaxLength(128)
  idempotencyKey: string;
}

export class RecoverFlowDto extends TriggerFlowDto {
  @ApiProperty({
    description: 'The failed run this recovery is allowed to replace',
  })
  @IsString()
  failedRunId: string;
}

export class ListFlowsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: FLOW_STATUSES })
  @IsIn(FLOW_STATUSES)
  @IsOptional()
  status?: AutomationFlowStatus;
}

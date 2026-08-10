import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { TaskPriority, TaskStatus } from '@prisma/client';
import { PageQueryDto } from '../../shared/dto/page-query.dto.js';

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export const TASK_STATUSES = [
  'TODO',
  'IN_PROGRESS',
  'REVIEW',
  'DONE',
  'CANCELLED',
] as const;

export class CreateTaskDto {
  @ApiProperty()
  @IsString()
  @MaxLength(300)
  title: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;

  @ApiPropertyOptional({ description: 'User id of the assignee' })
  @IsString()
  @IsOptional()
  assigneeId?: string;

  @ApiPropertyOptional({ enum: TASK_PRIORITIES, default: 'MEDIUM' })
  @IsIn(TASK_PRIORITIES)
  @IsOptional()
  priority?: TaskPriority;

  @ApiPropertyOptional({ description: 'ISO due date' })
  @IsDateString()
  @IsOptional()
  dueAt?: string;
}

export class UpdateTaskDto {
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(300)
  @IsOptional()
  title?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  assigneeId?: string;

  @ApiPropertyOptional({ enum: TASK_PRIORITIES })
  @IsIn(TASK_PRIORITIES)
  @IsOptional()
  priority?: TaskPriority;

  @ApiPropertyOptional({ enum: TASK_STATUSES })
  @IsIn(TASK_STATUSES)
  @IsOptional()
  status?: TaskStatus;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  dueAt?: string;
}

export class ListTasksQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: TASK_STATUSES })
  @IsIn(TASK_STATUSES)
  @IsOptional()
  status?: TaskStatus;

  @ApiPropertyOptional({ description: 'Filter by assignee user id' })
  @IsString()
  @IsOptional()
  assigneeId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;
}

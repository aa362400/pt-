import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PageQueryDto } from '../../shared/dto/page-query.dto.js';

export const NOTIFICATION_TYPES = [
  'SYSTEM',
  'ALERT',
  'REPORT_READY',
  'MENTION',
  'TASK_ASSIGNED',
  'APPROVAL_REQUIRED',
  'MILESTONE',
] as const;

export class CreateNotificationDto {
  @ApiProperty({ enum: NOTIFICATION_TYPES })
  @IsString()
  @IsIn(NOTIFICATION_TYPES)
  type: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  body?: string;
}

export class UpdateNotificationDto {
  @ApiPropertyOptional({ enum: NOTIFICATION_TYPES })
  @IsString()
  @IsIn(NOTIFICATION_TYPES)
  @IsOptional()
  type?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(200)
  @IsOptional()
  title?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  body?: string;
}

export class ListNotificationsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: NOTIFICATION_TYPES })
  @IsString()
  @IsIn(NOTIFICATION_TYPES)
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({ description: 'Filter by read/unread. Omit for all.' })
  @IsString()
  @IsOptional()
  read?: string;
}

export class MarkReadDto {
  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  ids?: string[];
}

export class NotificationDecisionDto {
  @ApiProperty({ enum: ['execute', 'dismiss'] })
  @IsString()
  @IsIn(['execute', 'dismiss'])
  decision: 'execute' | 'dismiss';
}

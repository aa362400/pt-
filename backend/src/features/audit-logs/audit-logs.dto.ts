import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { PageQueryDto } from '../../shared/dto/page-query.dto.js';

export class CreateAuditLogDto {
  @ApiProperty()
  @IsString()
  action: string;

  @ApiProperty()
  @IsString()
  resourceType: string;

  @ApiProperty()
  @IsString()
  resourceId: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  before?: unknown;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  after?: unknown;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  ip?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  userAgent?: string;
}

export class ListAuditLogsQueryDto extends PageQueryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  resourceType?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  resourceId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  action?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  actorId?: string;

  @ApiPropertyOptional({ description: 'Start date (ISO string)' })
  @Type(() => Date)
  @IsOptional()
  startDate?: Date;

  @ApiPropertyOptional({ description: 'End date (ISO string)' })
  @Type(() => Date)
  @IsOptional()
  endDate?: Date;
}

export class ArchiveAuditDayDto {
  @ApiProperty({ description: 'Closed UTC day in YYYY-MM-DD format' })
  @IsDateString({ strict: true })
  date: string;
}

export class IncidentTimelineQueryDto {
  @ApiPropertyOptional({ description: 'Agent run ID' })
  @IsString()
  @IsOptional()
  agentRunId?: string;

  @ApiPropertyOptional({ description: 'Automation run ID' })
  @IsString()
  @IsOptional()
  automationRunId?: string;

  @ApiPropertyOptional({ description: 'External submission ID' })
  @IsString()
  @IsOptional()
  externalSubmissionId?: string;

  @ApiPropertyOptional({ description: 'Product launch ID' })
  @IsString()
  @IsOptional()
  productLaunchId?: string;

  @ApiPropertyOptional({ description: 'W3C-correlated trace ID' })
  @IsString()
  @IsOptional()
  traceId?: string;
}

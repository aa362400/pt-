import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
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

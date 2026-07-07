import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { SessionContextType } from '@prisma/client';
import { PageQueryDto } from '../../shared/dto/page-query.dto.js';

export const SESSION_CONTEXT_TYPES = [
  'GENERAL',
  'PRODUCT_RESEARCH',
  'LISTING_OPTIMIZATION',
  'ADVERTISING',
  'PROFIT_ANALYSIS',
  'CUSTOMER_SERVICE',
  'TRAINING',
] as const;

export class CreateSessionDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ enum: SESSION_CONTEXT_TYPES, default: 'GENERAL' })
  @IsIn(SESSION_CONTEXT_TYPES)
  @IsOptional()
  contextType?: SessionContextType;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;
}

export class PostMessageDto {
  @ApiProperty({ description: 'User message content' })
  @IsString()
  @MaxLength(8000)
  content: string;
}

export class ListSessionsQueryDto extends PageQueryDto {}

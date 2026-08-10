import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PageQueryDto } from '../../shared/dto/page-query.dto.js';

export const APPROVAL_ITEM_STATUSES = [
  'PENDING',
  'EXECUTING',
  'UNKNOWN',
  'APPROVED',
  'EXECUTED',
  'DISMISSED',
  'CHANGES_REQUESTED',
  'REJECTED',
  'FAILED',
  'EXPIRED',
] as const;

export const APPROVAL_ACTIONS = [
  'product-launch.confirm-publish',
  'ozon.listing.publish',
  'ozon.product.update',
  'ozon.price.update',
  'ozon.stock.update',
  'ozon.order.refund',
  'ozon.chat.send_message',
  'ozon.question.answer',
  'ozon.review.comment',
  'operator.prepare_listing_batch',
  'automation.recover',
] as const;

export class ListApprovalItemsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: APPROVAL_ITEM_STATUSES })
  @IsString()
  @IsIn(APPROVAL_ITEM_STATUSES)
  @IsOptional()
  status?: (typeof APPROVAL_ITEM_STATUSES)[number];
}

export class CreateApprovalItemDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  body?: string;

  @ApiProperty({ enum: APPROVAL_ACTIONS })
  @IsString()
  @IsIn(APPROVAL_ACTIONS)
  action: (typeof APPROVAL_ACTIONS)[number];

  @ApiProperty({ type: Object })
  @IsObject()
  params: Record<string, unknown>;

  @ApiPropertyOptional({ type: Object })
  @IsObject()
  @IsOptional()
  context?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsISO8601()
  @IsOptional()
  expiresAt?: string;
}

export class ApproveApprovalItemDto {
  @ApiPropertyOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  sandboxReportId?: string;
}

export class ReviewApprovalItemDto {
  @ApiProperty()
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  sandboxReportId?: string;
}

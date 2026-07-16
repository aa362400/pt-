import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../shared/dto/page-query.dto.js';

export class CreateResearchReportDto {
  @ApiProperty({ description: 'Product or niche to research' })
  @IsString()
  @MaxLength(300)
  query: string;

  @ApiProperty({ example: 'amazon_us' })
  @IsString()
  @MaxLength(50)
  platform: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;
}

export class ListResearchReportsQueryDto extends PageQueryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;
}

export const RESEARCH_CANDIDATE_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'all',
] as const;

export class ListResearchCandidatesQueryDto extends PageQueryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  workspaceId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    enum: RESEARCH_CANDIDATE_STATUSES,
    default: 'pending',
  })
  @IsIn(RESEARCH_CANDIDATE_STATUSES)
  @IsOptional()
  status?: (typeof RESEARCH_CANDIDATE_STATUSES)[number];
}

export class ApproveResearchCandidateDto {
  @ApiPropertyOptional({
    description:
      'Target workspace. If omitted, the report workspace is used, then Ozon workspace, then first org workspace.',
  })
  @IsString()
  @IsOptional()
  workspaceId?: string;
}

export class RejectResearchCandidateDto {
  @ApiProperty({
    description:
      'Human rejection reason used as durable learning context for future research',
  })
  @IsString()
  @MaxLength(500)
  reason: string;
}

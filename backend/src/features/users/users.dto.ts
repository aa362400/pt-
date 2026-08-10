import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  IsIn,
  IsNotEmpty,
} from 'class-validator';
import { PageQueryDto } from '../../shared/dto/page-query.dto.js';

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(100)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsUrl({ require_tld: false })
  @IsOptional()
  avatarUrl?: string;

  @ApiPropertyOptional({ example: 'zh-CN' })
  @IsString()
  @MaxLength(10)
  @IsOptional()
  locale?: string;

  @ApiPropertyOptional({ example: 'Asia/Shanghai' })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  timezone?: string;
}

export class ListMembersQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Filter by name/email substring' })
  @IsString()
  @IsOptional()
  search?: string;
}

export class AccountDeletionReasonDto {
  @ApiProperty({ description: 'Reason for account deletion' })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiProperty({ description: 'Confirm account password' })
  @IsString()
  @IsNotEmpty()
  confirmPassword: string;
}

export class ExportDataDto {
  @ApiPropertyOptional({
    description: 'Scope of data to export',
    example: 'all',
  })
  @IsString()
  @IsIn(['all', 'basic', 'agent-runs', 'listings'])
  @IsOptional()
  scope?: 'all' | 'basic' | 'agent-runs' | 'listings';
}

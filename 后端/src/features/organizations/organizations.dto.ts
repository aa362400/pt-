import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import type { MembershipRole } from '@prisma/client';
import { PageQueryDto } from '../../shared/dto/page-query.dto.js';

export const MEMBER_ROLES = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as const;

export class UpdateOrganizationDto {
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(100)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'URL-safe unique slug' })
  @Matches(/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$/)
  @IsOptional()
  slug?: string;
}

export class ListOrgMembersQueryDto extends PageQueryDto {}

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: MEMBER_ROLES })
  @IsIn(MEMBER_ROLES)
  role: MembershipRole;
}

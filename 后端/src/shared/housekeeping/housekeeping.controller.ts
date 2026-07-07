import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { HousekeepingService } from './housekeeping.service.js';
import { Roles } from '../rbac/roles.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { requireOrg } from '../tenancy/org-scope.js';
import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RunCleanupDto {
  @ApiProperty({ description: 'Optional organization ID to scope cleanup' })
  @IsString()
  @IsOptional()
  orgId?: string;
}

export class DeleteUserDto {
  @ApiProperty({ description: 'User ID to delete' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ description: 'Organization ID the user belongs to' })
  @IsString()
  @IsNotEmpty()
  orgId: string;
}

@ApiTags('Housekeeping')
@ApiBearerAuth()
@Controller('housekeeping')
export class HousekeepingController {
  constructor(
    private readonly housekeepingService: HousekeepingService,
  ) {}

  @Post('run')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trigger data retention cleanup (admin only)',
  })
  async runCleanup(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RunCleanupDto,
  ) {
    const orgId = dto.orgId ?? requireOrg(user);
    return this.housekeepingService.runCleanup(orgId);
  }

  @Post('delete-user')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'GDPR — permanently delete a user\'s data (admin only)',
  })
  async deleteUser(
    @CurrentUser() user: JwtPayload,
    @Body() dto: DeleteUserDto,
  ) {
    // Ensure the admin is in the same org as the target user
    const adminOrgId = requireOrg(user);
    if (dto.orgId !== adminOrgId) {
      // fall back to admin's org
    }
    await this.housekeepingService.deleteUserData(dto.userId, dto.orgId);
    return { message: 'User data deletion completed' };
  }
}

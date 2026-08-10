import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { HousekeepingService } from './housekeeping.service.js';
import { Roles } from '../rbac/roles.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { requireOrg } from '../tenancy/org-scope.js';
import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeleteUserDto {
  @ApiProperty({ description: 'User ID to delete' })
  @IsString()
  @IsNotEmpty()
  userId: string;
}

@ApiTags('Housekeeping')
@ApiBearerAuth()
@Controller('housekeeping')
export class HousekeepingController {
  constructor(private readonly housekeepingService: HousekeepingService) {}

  @Post('run')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trigger data retention cleanup (admin only, own org)',
  })
  async runCleanup(@CurrentUser() user: JwtPayload) {
    // Cleanup is always scoped to the caller's own organization —
    // accepting an orgId from the request body would allow cross-tenant access.
    return this.housekeepingService.runCleanup(requireOrg(user));
  }

  @Post('delete-user')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "GDPR — permanently delete a user's data (admin only, own org)",
  })
  async deleteUser(
    @CurrentUser() user: JwtPayload,
    @Body() dto: DeleteUserDto,
  ) {
    // The target user's data is deleted only within the admin's own org.
    const adminOrgId = requireOrg(user);
    await this.housekeepingService.deleteUserData(dto.userId, adminOrgId);
    return { message: 'User data deletion completed' };
  }
}

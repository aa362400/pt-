import {
  Controller,
  Get,
  Patch,
  Delete,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service.js';
import {
  ListMembersQueryDto,
  UpdateProfileDto,
  AccountDeletionReasonDto,
  ExportDataDto,
} from './users.dto.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { requireOrg } from '../../shared/tenancy/org-scope.js';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the current user profile with memberships' })
  me(@CurrentUser() user: JwtPayload) {
    return this.usersService.me(user);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the current user profile' })
  updateMe(@CurrentUser() user: JwtPayload, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateMe(user, dto);
  }

  @Delete('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Delete the current user account and all associated data (GDPR right to erasure)',
  })
  async deleteMe(
    @CurrentUser() user: JwtPayload,
    @Body() _dto: AccountDeletionReasonDto,
  ) {
    const orgId = requireOrg(user);
    await this.usersService.deleteMyAccount(user.sub, orgId);
    return {
      message: 'Your account has been permanently deleted.',
    };
  }

  @Post('export-data')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Export all user data as JSON (GDPR right to data portability)',
  })
  async exportData(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ExportDataDto,
  ) {
    const orgId = requireOrg(user);
    return this.usersService.exportMyData(user.sub, orgId, dto.scope);
  }

  @Get()
  @ApiOperation({ summary: 'List users of the current organization' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListMembersQueryDto,
  ) {
    return this.usersService.listOrgUsers(user, query);
  }
}

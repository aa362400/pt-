import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service.js';
import {
  ListOrgMembersQueryDto,
  UpdateMemberRoleDto,
  UpdateOrganizationDto,
} from './organizations.dto.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import { Roles } from '../../shared/rbac/roles.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get('current')
  @ApiOperation({ summary: 'Get the current organization with counts' })
  current(@CurrentUser() user: JwtPayload) {
    return this.organizationsService.current(user);
  }

  @Patch('current')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Update the current organization (owner/admin)' })
  update(@CurrentUser() user: JwtPayload, @Body() dto: UpdateOrganizationDto) {
    return this.organizationsService.update(user, dto);
  }

  @Get('members')
  @ApiOperation({ summary: 'List members of the current organization' })
  listMembers(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListOrgMembersQueryDto,
  ) {
    return this.organizationsService.listMembers(user, query);
  }

  @Patch('members/:id')
  @Roles('OWNER')
  @ApiOperation({ summary: "Change a member's role (owner only)" })
  updateMemberRole(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.organizationsService.updateMemberRole(user, id, dto);
  }

  @Delete('members/:id')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Remove a member (owner/admin)' })
  removeMember(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.organizationsService.removeMember(user, id);
  }
}

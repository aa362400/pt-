import { Controller, Get, Param, Put, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import { Roles } from '../../shared/rbac/roles.decorator.js';
import { StoreAgentProfileService } from './store-agent-profile.service.js';
import { UpdateStoreAgentProfileDto } from './store-agent-profile.dto.js';

@ApiTags('Store Agent Profile')
@ApiBearerAuth()
@Controller('store-agent-profiles')
export class StoreAgentProfileController {
  constructor(private readonly profiles: StoreAgentProfileService) {}

  @Get(':workspaceId')
  @ApiOperation({
    summary: 'Get durable agent operating rules for an Ozon workspace',
  })
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.profiles.findForWorkspace(user, workspaceId);
  }

  @Put(':workspaceId')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({
    summary: 'Update durable agent operating rules for an Ozon workspace',
  })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('workspaceId') workspaceId: string,
    @Body() body: UpdateStoreAgentProfileDto,
  ) {
    return this.profiles.upsertForWorkspace(user, workspaceId, body);
  }
}

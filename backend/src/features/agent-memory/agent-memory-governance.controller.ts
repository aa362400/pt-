import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { Roles } from '../../shared/rbac/roles.decorator.js';
import { AgentMemoryGovernanceService } from './agent-memory-governance.service.js';

@ApiTags('Agent Memory Governance')
@ApiBearerAuth()
@Controller('agent-memory-governance')
export class AgentMemoryGovernanceController {
  constructor(private readonly governance: AgentMemoryGovernanceService) {}

  @Get()
  @ApiOperation({
    summary: 'List governed agent memory including quarantined records',
  })
  list(
    @CurrentUser() user: JwtPayload,
    @Query('workspaceId') workspaceId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.governance.list(user, {
      workspaceId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Patch('experiences/:id/correct')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Create a corrected trusted memory version' })
  correct(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { notes: string; reason: string },
  ) {
    return this.governance.correctExperience(user, id, body);
  }

  @Delete(':type/:id')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Revoke memory while retaining audit evidence' })
  revoke(
    @CurrentUser() user: JwtPayload,
    @Param('type') type: 'work' | 'experience',
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    return this.governance.revoke(user, type, id, body);
  }
}

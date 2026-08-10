import { Body, Controller, Get, Patch, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { Roles } from '../../shared/rbac/roles.decorator.js';
import { requireOrg } from '../../shared/tenancy/org-scope.js';
import { AgentAutonomyService } from './agent-autonomy.service.js';
import {
  UpdateAgentAutonomyModeDto,
  UpdateAgentAutonomyPolicyDto,
} from './agent-autonomy.dto.js';

@ApiTags('Agent Autonomy')
@Controller('agent-autonomy')
export class AgentAutonomyController {
  constructor(private readonly autonomy: AgentAutonomyService) {}

  @Get('mode')
  @ApiOperation({
    summary: 'Get the current organization L2 draft autonomy mode',
  })
  getMode(@CurrentUser() user: JwtPayload) {
    return this.autonomy.getMode(requireOrg(user));
  }

  @Get('policy')
  @ApiOperation({ summary: 'Get my effective Agent autonomy policy' })
  getPolicy(@CurrentUser() user: JwtPayload) {
    return this.autonomy.getEffectivePolicy(requireOrg(user), user.sub);
  }

  @Put('policy')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Set organization or user Agent autonomy policy' })
  updatePolicy(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateAgentAutonomyPolicyDto,
  ) {
    return this.autonomy.setPolicy(requireOrg(user), user.sub, dto);
  }

  @Patch('mode')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Enable or disable L2 research and draft autonomy' })
  updateMode(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateAgentAutonomyModeDto,
  ) {
    return this.autonomy.setAutoDraftMode(
      requireOrg(user),
      user.sub,
      dto.autoResearchAndDraftEnabled,
    );
  }
}

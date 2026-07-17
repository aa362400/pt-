import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AgentPermissionsService } from './agent-permissions.service.js';
import { Roles } from '../rbac/roles.decorator.js';
import { Public } from '../auth/public.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { requireOrg } from '../tenancy/org-scope.js';
import { OrganizationAgentControlService } from '../agent-control/organization-agent-control.service.js';
import { OrganizationAgentControlCommandDto } from '../agent-control/organization-agent-control.dto.js';
import { OrganizationAgentControlResumeDispatcherService } from '../agent-control/organization-agent-control-resume-dispatcher.service.js';
import { createHash, timingSafeEqual } from 'node:crypto';

@ApiTags('Agent Control')
@Controller('admin/agent')
export class AgentKillSwitchController {
  constructor(
    private readonly control: OrganizationAgentControlService,
    private readonly permissions: AgentPermissionsService,
    private readonly configService: ConfigService,
    private readonly resumeDispatcher: OrganizationAgentControlResumeDispatcherService,
  ) {}

  private assertAgentApiKey(apiKey: string | undefined): void {
    const expected = this.configService.get<string>('AGENT_API_KEY');
    const suppliedDigest = createHash('sha256')
      .update(apiKey ?? '', 'utf8')
      .digest();
    const expectedDigest = createHash('sha256')
      .update(expected ?? '', 'utf8')
      .digest();
    if (!expected || !timingSafeEqual(suppliedDigest, expectedDigest)) {
      throw new UnauthorizedException('Invalid agent API key');
    }
  }

  // ─── Kill-switch endpoints (ADMIN only) ───────────────────────────

  @Post('pause')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({
    summary: 'Pause all agent activity for an org (kill switch)',
  })
  pause(
    @CurrentUser() user: JwtPayload,
    @Body() dto: OrganizationAgentControlCommandDto = {},
  ) {
    const orgId = requireOrg(user);
    return this.control.pause({
      organizationId: orgId,
      actorId: user.sub,
      expectedRevision: dto.expectedRevision,
      reason: dto.reason,
    });
  }

  @Post('resume')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Resume agent activity' })
  async resume(
    @CurrentUser() user: JwtPayload,
    @Body() dto: OrganizationAgentControlCommandDto = {},
  ) {
    const orgId = requireOrg(user);
    const control = await this.control.resume({
      organizationId: orgId,
      actorId: user.sub,
      expectedRevision: dto.expectedRevision,
      reason: dto.reason,
    });
    const resumeDispatch = await this.resumeDispatcher.dispatch(
      orgId,
      control.revision,
    );
    return { ...control, resumeDispatch };
  }

  @Post('stop')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Safely stop all agent activity for an org' })
  stop(
    @CurrentUser() user: JwtPayload,
    @Body() dto: OrganizationAgentControlCommandDto = {},
  ) {
    const orgId = requireOrg(user);
    return this.control.stop({
      organizationId: orgId,
      actorId: user.sub,
      expectedRevision: dto.expectedRevision,
      reason: dto.reason,
    });
  }

  @Get('status')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Get agent status for a specific org' })
  status(@CurrentUser() user: JwtPayload) {
    const orgId = requireOrg(user);
    return this.control.status(orgId);
  }

  // ─── Permission check endpoints (agent-facing, public) ─────────────

  @Public()
  @Get('check')
  @ApiOperation({
    summary: 'Check if agent is allowed to perform an action for an org',
  })
  async checkAction(
    @Headers('x-api-key') apiKey: string,
    @Query('orgId') orgId: string,
    @Query('action') action: string,
  ) {
    this.assertAgentApiKey(apiKey);
    if (!orgId || !action) {
      return {
        allowed: false,
        level: 1,
        requireConfirm: true,
        reason: 'Missing orgId or action parameter',
      };
    }

    const result = await this.permissions.check(orgId, action);
    return {
      ...result,
      reason: result.allowed ? undefined : 'Permission denied',
    };
  }

  @Public()
  @Get('autonomy')
  @ApiOperation({ summary: 'Check if agent autonomy is enabled for an org' })
  async autonomy(
    @Headers('x-api-key') apiKey: string,
    @Query('orgId') orgId: string,
  ) {
    this.assertAgentApiKey(apiKey);
    if (!orgId) {
      return { enabled: false, reason: 'Missing orgId parameter' };
    }
    const enabled = await this.permissions.isAutonomyEnabled(orgId);
    return { enabled, orgId };
  }

  @Public()
  @Get('actions')
  @ApiOperation({
    summary: 'List all available agent actions with permission levels',
  })
  // Keep service-token failures as rejected promises for internal clients.
  // eslint-disable-next-line @typescript-eslint/require-await
  async actions(@Headers('x-api-key') apiKey: string) {
    this.assertAgentApiKey(apiKey);
    return this.permissions.listActions();
  }
}

import {
  Controller,
  Get,
  Post,
  Headers,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service.js';
import { AgentPermissionsService } from './agent-permissions.service.js';
import { Roles } from '../rbac/roles.decorator.js';
import { Public } from '../auth/public.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { requireOrg } from '../tenancy/org-scope.js';

@ApiTags('Agent Control')
@Controller('admin/agent')
export class AgentKillSwitchController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: AgentPermissionsService,
    private readonly configService: ConfigService,
  ) {}

  private assertAgentApiKey(apiKey: string | undefined): void {
    const expected = this.configService.get<string>('AGENT_API_KEY');
    if (!expected || apiKey !== expected) {
      throw new UnauthorizedException('Invalid agent API key');
    }
  }

  // ─── Kill-switch endpoints (ADMIN only) ───────────────────────────

  @Post('pause')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({
    summary: 'Pause all agent activity for an org (kill switch)',
  })
  async pause(@CurrentUser() user: JwtPayload) {
    const orgId = requireOrg(user);
    await this.prisma.featureFlag.upsert({
      where: { name: `agent-paused-${orgId}` },
      create: { name: `agent-paused-${orgId}`, enabled: true },
      update: { enabled: true },
    });
    return { paused: true, orgId };
  }

  @Post('resume')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Resume agent activity' })
  async resume(@CurrentUser() user: JwtPayload) {
    const orgId = requireOrg(user);
    await this.prisma.featureFlag.upsert({
      where: { name: `agent-paused-${orgId}` },
      create: { name: `agent-paused-${orgId}`, enabled: false },
      update: { enabled: false },
    });
    return { paused: false, orgId };
  }

  @Get('status')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Get agent status for a specific org' })
  async status(@CurrentUser() user: JwtPayload) {
    const orgId = requireOrg(user);
    const flag = await this.prisma.featureFlag.findUnique({
      where: { name: `agent-paused-${orgId}` },
    });
    return { paused: flag?.enabled ?? false, orgId };
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

    // Also check kill-switch
    const killFlag = await this.prisma.featureFlag.findUnique({
      where: { name: `agent-paused-${orgId}` },
    });
    if (killFlag?.enabled) {
      return {
        allowed: false,
        level: 1,
        requireConfirm: true,
        reason: 'Agent activity is paused for this organization',
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

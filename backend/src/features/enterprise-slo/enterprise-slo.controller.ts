import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { Roles } from '../../shared/rbac/roles.decorator.js';
import { requireOrg } from '../../shared/tenancy/org-scope.js';
import { EnterpriseSloService } from './enterprise-slo.service.js';
import {
  ApproveJudgeGoldDto,
  RevokeJudgeGoldDto,
} from './judge-gold-approval.dto.js';
import { JudgeGoldApprovalService } from './judge-gold-approval.service.js';

@ApiTags('Enterprise SLO')
@Controller('enterprise-slo')
export class EnterpriseSloController {
  constructor(
    private readonly service: EnterpriseSloService,
    private readonly judgeGold: JudgeGoldApprovalService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Read the fact-backed rolling 14-day SLO report' })
  report(@CurrentUser() user: JwtPayload) {
    return this.service.getReport(requireOrg(user));
  }

  @Get('readiness-gates')
  @ApiOperation({
    summary: 'Read the latest persisted enterprise gate evidence',
  })
  readinessGates(@CurrentUser() user: JwtPayload) {
    return this.service.getReadinessGates(requireOrg(user));
  }

  @Post('collect')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Refresh today enterprise SLO snapshot' })
  async collect(@CurrentUser() user: JwtPayload) {
    const organizationId = requireOrg(user);
    await this.service.collectCurrentAndPrevious(organizationId);
    return this.service.getReport(organizationId, { collectToday: false });
  }

  @Get('judge-gold')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Preview the signed Judge gold approval gate' })
  judgeGoldStatus(@CurrentUser() user: JwtPayload) {
    return this.judgeGold.getStatus(requireOrg(user));
  }

  @Post('judge-gold/approve')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({
    summary: 'Approve every Judge gold case and sign the evidence',
  })
  approveJudgeGold(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ApproveJudgeGoldDto,
  ) {
    return this.judgeGold.approve(requireOrg(user), user, dto);
  }

  @Post('judge-gold/revoke')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Revoke the current Judge gold approval' })
  revokeJudgeGold(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RevokeJudgeGoldDto,
  ) {
    return this.judgeGold.revoke(requireOrg(user), user, dto);
  }
}

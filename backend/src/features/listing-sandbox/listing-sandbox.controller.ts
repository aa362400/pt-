import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { Roles } from '../../shared/rbac/roles.decorator.js';
import { requireOrg } from '../../shared/tenancy/org-scope.js';
import {
  EvaluateListingSandboxDto,
  OverrideListingSandboxDto,
} from './listing-sandbox.dto.js';
import { ListingSandboxService } from './listing-sandbox.service.js';

@ApiTags('Listing Sandbox')
@ApiBearerAuth()
@Controller('listing-sandbox')
export class ListingSandboxController {
  constructor(private readonly sandbox: ListingSandboxService) {}

  @Post('evaluate')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({
    summary: 'Evaluate an immutable listing publish snapshot before dispatch',
  })
  evaluate(
    @CurrentUser() user: JwtPayload,
    @Body() dto: EvaluateListingSandboxDto,
  ) {
    return this.sandbox.evaluate({
      organizationId: requireOrg(user),
      snapshotId: dto.snapshotId,
      actorId: user.sub,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read a listing sandbox report and its rule hits' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.sandbox.getReport(requireOrg(user), id);
  }

  @Post(':id/override')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({
    summary: 'Override a blocked listing with a mandatory audited reason',
  })
  override(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: OverrideListingSandboxDto,
  ) {
    return this.sandbox.override({
      organizationId: requireOrg(user),
      reportId: id,
      actorId: user.sub,
      actorRole: user.role ?? 'VIEWER',
      reason: dto.reason,
    });
  }
}

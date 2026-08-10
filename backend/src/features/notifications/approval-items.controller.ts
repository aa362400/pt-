import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { Roles } from '../../shared/rbac/roles.decorator.js';
import { requireOrg } from '../../shared/tenancy/org-scope.js';
import { ListingSandboxService } from '../listing-sandbox/listing-sandbox.service.js';
import { ActionProposalsService } from './action-proposals.service.js';
import {
  ApproveApprovalItemDto,
  CreateApprovalItemDto,
  ListApprovalItemsQueryDto,
  ReviewApprovalItemDto,
} from './approval-items.dto.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('Approval Items')
@ApiBearerAuth()
@Controller('approval-items')
export class ApprovalItemsController {
  constructor(
    private readonly proposals: ActionProposalsService,
    private readonly notifications: NotificationsService,
    private readonly sandbox: ListingSandboxService,
  ) {}

  @Post()
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a trusted, hash-bound approval item' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateApprovalItemDto) {
    const organizationId = requireOrg(user);
    return this.proposals.create({
      organizationId,
      requestedBy: user.sub,
      approverId: user.sub,
      source: 'approval-items-api',
      title: dto.title,
      body: dto.body,
      action: {
        label: 'english_text',
        name: dto.action,
        params: dto.params,
      },
      context: {
        kind: 'high_risk_action_review',
        riskLevel: 'high',
        ...dto.context,
      },
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List organization approval items' })
  list(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListApprovalItemsQueryDto,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    return this.proposals.list({
      organizationId: requireOrg(user),
      actorId: user.sub,
      actorRole: user.role ?? 'VIEWER',
      status: query.status,
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read an approval item and immutable decisions' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.proposals.findById({
      organizationId: requireOrg(user),
      proposalId: id,
      actorId: user.sub,
      actorRole: user.role ?? 'VIEWER',
    });
  }

  @Post(':id/approve')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Approve and execute a trusted approval item' })
  approve(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ApproveApprovalItemDto,
  ) {
    return this.notifications.decideProposal(user, id, dto);
  }

  @Post(':id/reject')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Reject an approval item with a required reason' })
  reject(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ReviewApprovalItemDto,
  ) {
    return this.proposals.recordReviewDecision({
      organizationId: requireOrg(user),
      proposalId: id,
      actorId: user.sub,
      actorRole: user.role ?? 'VIEWER',
      decision: 'REJECT',
      reason: dto.reason,
      sandboxReportId: dto.sandboxReportId,
    });
  }

  @Post(':id/request-changes')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Request changes with a required reason' })
  requestChanges(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ReviewApprovalItemDto,
  ) {
    return this.proposals.recordReviewDecision({
      organizationId: requireOrg(user),
      proposalId: id,
      actorId: user.sub,
      actorRole: user.role ?? 'VIEWER',
      decision: 'REQUEST_CHANGES',
      reason: dto.reason,
      sandboxReportId: dto.sandboxReportId,
    });
  }

  @Post(':id/override')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({
    summary: 'Override a blocked sandbox report, then execute the approval',
  })
  async override(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ReviewApprovalItemDto,
  ) {
    if (!dto.sandboxReportId) {
      throw new BadRequestException(
        'sandboxReportId is required for an override',
      );
    }
    await this.sandbox.override({
      organizationId: requireOrg(user),
      reportId: dto.sandboxReportId,
      actorId: user.sub,
      actorRole: user.role ?? 'VIEWER',
      reason: dto.reason,
    });
    return this.notifications.decideProposal(user, id, {
      reason: dto.reason,
      sandboxReportId: dto.sandboxReportId,
    });
  }
}

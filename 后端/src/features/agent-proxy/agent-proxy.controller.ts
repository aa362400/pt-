import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  Query,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { AgentPermissionsService } from '../../shared/agent-permissions/agent-permissions.service.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import { CurrentUser } from '../../shared/auth/current-user.decorator.js';
import { Public } from '../../shared/auth/public.decorator.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import { requireOrg } from '../../shared/tenancy/org-scope.js';
import { LinkfoxSkillCliService } from '../../shared/linkfox-skill/linkfox-skill-cli.service.js';
import { AgentAutonomyService } from '../agent-autonomy/agent-autonomy.service.js';
import { AgentRunsService } from '../agent-runs/agent-runs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ActionProposalsService } from '../notifications/action-proposals.service.js';
import { AgentProxyConsoleDto, AgentProxyDto } from './agent-proxy.dto.js';
import {
  CommerceMcpClientService,
  type CommerceMcpToolName,
} from '../../shared/commerce-mcp/commerce-mcp-client.service.js';
import { AgentHealthService } from '../../agents/agent-health.service.js';
import { Roles } from '../../shared/rbac/roles.decorator.js';
import { AgentCapabilityTokenService } from './agent-capability-token.service.js';
import { IssueAgentCapabilityTokenDto } from './agent-capability-token.dto.js';
import { CommerceMcpTrustService } from '../../shared/commerce-mcp/commerce-mcp-trust.service.js';

const MCP_ACTION_TO_TOOL: Record<string, CommerceMcpToolName> = {
  'commerce.profit.calculate': 'calc_profit',
  'commerce.keywords.analyze': 'suggest_keywords',
  'commerce.image_prompts.generate': 'generate_image_prompts',
  'commerce.csv.export': 'export_listing_csv',
  'temu.price_check': 'temu_price_check',
  'temu.pricing.calculate': 'temu_pricing_engine',
  'ozon.pricing.calculate': 'ozon_pricing_engine',
  'commerce.risk.check': 'check_risk',
  'amazon.title.optimize': 'amazon_title_optimizer',
  'listing.quality.score': 'listing_quality_score',
};

@ApiTags('Agent Proxy')
@Controller('agent-proxy')
export class AgentProxyController {
  constructor(
    private readonly configService: ConfigService,
    private readonly agentPermissions: AgentPermissionsService,
    private readonly audit: AuditService,
    private readonly autonomy: AgentAutonomyService,
    private readonly agentRuns: AgentRunsService,
    private readonly prisma: PrismaService,
    private readonly tenantDatabase: TenantDatabaseContextService,
    private readonly notifications: NotificationsService,
    private readonly actionProposals: ActionProposalsService,
    private readonly linkfoxSkillCli: LinkfoxSkillCliService,
    private readonly commerceMcpClient: CommerceMcpClientService,
    private readonly commerceMcpTrust: CommerceMcpTrustService,
    private readonly agentHealth: AgentHealthService,
    private readonly capabilityTokens: AgentCapabilityTokenService,
  ) {}

  /**
   * Agent calls this to execute a platform action on behalf of a user.
   * The action must be registered in AgentPermissionsService and pass the permission check.
   */
  @Post()
  @Public()
  @ApiOperation({ summary: 'Execute a platform action via agent proxy' })
  async proxy(
    @Headers('x-api-key') apiKey: string,
    @Body() dto: AgentProxyDto,
    @Headers('x-agent-capability') capabilityToken?: string,
  ) {
    // Authenticate as agent
    const expected = this.configService.get<string>('AGENT_API_KEY');
    if (!expected || apiKey !== expected) {
      throw new UnauthorizedException('Invalid agent API key');
    }

    const capability = await this.capabilityTokens.validate({
      rawToken: capabilityToken,
      organizationId: dto.orgId,
      workspaceId: dto.workspaceId,
      action: dto.action,
    });

    return this.executeProxyCall({ ...dto, actorId: capability.actorId });
  }

  @Post('capability-tokens')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({
    summary: 'Issue a short-lived scoped agent capability token',
  })
  async issueCapabilityToken(
    @CurrentUser() user: JwtPayload,
    @Body() dto: IssueAgentCapabilityTokenDto,
  ) {
    const organizationId = requireOrg(user);
    const registeredActions = new Set(
      this.agentPermissions.listActions().map((action) => action.name),
    );
    const unknown = dto.actions.filter(
      (action) => !registeredActions.has(action),
    );
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Unknown capability actions: ${unknown.join(', ')}`,
      );
    }
    const issued = await this.capabilityTokens.issue({
      organizationId,
      workspaceId: dto.workspaceId,
      actorId: user.sub,
      actions: dto.actions,
      ttlSeconds: dto.ttlSeconds,
      description: dto.description,
    });
    try {
      await this.audit.appendStrict({
        organizationId,
        actorId: user.sub,
        action: 'agent-capability.issue',
        resourceType: 'AgentCapabilityToken',
        resourceId: issued.id,
        after: {
          workspaceId: issued.workspaceId,
          actions: issued.actions,
          expiresAt: issued.expiresAt,
          description: issued.description,
        },
      });
    } catch (error) {
      await this.capabilityTokens.revoke(organizationId, issued.id);
      throw error;
    }
    return issued;
  }

  @Get('capability-tokens')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({
    summary: 'List scoped capability metadata without token secrets',
  })
  listCapabilityTokens(@CurrentUser() user: JwtPayload) {
    return this.capabilityTokens.list(requireOrg(user));
  }

  @Post('capability-tokens/:id/revoke')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Revoke an agent capability token immediately' })
  async revokeCapabilityToken(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const organizationId = requireOrg(user);
    const result = await this.capabilityTokens.revoke(organizationId, id);
    await this.audit.appendStrict({
      organizationId,
      actorId: user.sub,
      action: 'agent-capability.revoke',
      resourceType: 'AgentCapabilityToken',
      resourceId: id,
      after: { revoked: true },
    });
    return result;
  }

  @Get('actions')
  @ApiOperation({ summary: 'List agent proxy actions available to the user' })
  async listActions(@CurrentUser() user: JwtPayload) {
    const orgId = requireOrg(user);
    const autonomyEnabled =
      await this.agentPermissions.isAutonomyEnabled(orgId);
    const actions = await Promise.all(
      this.agentPermissions.listActions().map(async (action) => ({
        ...action,
        permission: await this.agentPermissions.check(orgId, action.name),
      })),
    );
    return { autonomyEnabled, actions };
  }

  @Get('health')
  @ApiOperation({
    summary: 'Get the real agent connection and model runtime state',
  })
  async health(@CurrentUser() user: JwtPayload) {
    requireOrg(user);
    return this.agentHealth.getSnapshot();
  }

  @Get('mcp-runs')
  @ApiOperation({
    summary: 'List organization-scoped MCP tool invocation evidence',
  })
  async mcpRuns(
    @CurrentUser() user: JwtPayload,
    @Query('limit') limitInput?: string,
  ) {
    const organizationId = requireOrg(user);
    const parsed = Number(limitInput ?? 50);
    const limit = Number.isFinite(parsed)
      ? Math.max(1, Math.min(100, Math.trunc(parsed)))
      : 50;
    const items = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.mcpToolInvocation.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
    );
    return { items, total: items.length, limit };
  }

  @Get('mcp-manifest')
  @ApiOperation({
    summary:
      'Read the live MCP tool manifest, integrity hash and organization grants',
  })
  async mcpManifest(@CurrentUser() user: JwtPayload) {
    const organizationId = requireOrg(user);
    const trustStatus = await this.commerceMcpTrust.inspect();
    const manifest = trustStatus.manifest;
    const reverse = new Map(
      Object.entries(MCP_ACTION_TO_TOOL).map(([action, tool]) => [
        tool,
        action,
      ]),
    );
    const tools = await Promise.all(
      manifest.tools.map(async (tool) => {
        const action = reverse.get(tool.name) ?? null;
        const permission = action
          ? await this.agentPermissions.check(organizationId, action)
          : null;
        return {
          ...tool,
          action,
          permission,
          trust: {
            source: trustStatus.source,
            integrityVerified: trustStatus.integrityVerified,
            manifestHash: manifest.manifestHash,
            executableHash: manifest.executableHash,
            approvalType: trustStatus.approvalType,
            approvalExpiresAt: trustStatus.expiresAt,
            signing: trustStatus.signing,
            blockers: trustStatus.reasons,
            outputInjectionPolicy: 'block_known_instruction_patterns',
          },
        };
      }),
    );
    return {
      ...manifest,
      trust: {
        status: trustStatus.status,
        integrityVerified: trustStatus.integrityVerified,
        source: trustStatus.source,
        approvalType: trustStatus.approvalType,
        approvedAt: trustStatus.approvedAt,
        expiresAt: trustStatus.expiresAt,
        signing: trustStatus.signing,
        blockers: trustStatus.reasons,
      },
      tools,
    };
  }

  @Post('console')
  @ApiOperation({
    summary: 'Execute an agent action from the authenticated UI',
  })
  async console(
    @CurrentUser() user: JwtPayload,
    @Body() dto: AgentProxyConsoleDto,
  ) {
    const orgId = requireOrg(user);
    return this.executeProxyCall({
      orgId,
      actorId: user.sub,
      workspaceId: dto.workspaceId,
      action: dto.action,
      params: dto.params,
      dryRun: dto.dryRun ?? true,
    });
  }

  private async executeProxyCall(dto: AgentProxyDto) {
    const { orgId, actorId, workspaceId, action, params, dryRun } = dto;

    // Check if autonomy is enabled for this org
    const autonomyEnabled =
      await this.agentPermissions.isAutonomyEnabled(orgId);
    if (!autonomyEnabled) {
      await this.auditUnauthorizedOperation({
        orgId,
        actorId,
        action,
        params,
        reason: 'autonomy_disabled',
      });
      throw new ForbiddenException(
        'Agent autonomy not enabled for this organization',
      );
    }

    // Check permission
    const permission = await this.agentPermissions.check(orgId, action);
    if (!permission.allowed) {
      await this.auditUnauthorizedOperation({
        orgId,
        actorId,
        action,
        params,
        reason: 'permission_denied',
        permission,
      });
      throw new ForbiddenException(
        `Action "${action}" not allowed for this org's plan`,
      );
    }

    // If dry-run, just return the permission check result
    if (dryRun) {
      return { dryRun: true, permission, action };
    }

    const auditActorId = await this.autonomy.resolveActorForOrg(orgId, actorId);
    const requiresConfirmation =
      permission.requireConfirm || this.isHardConfirmationAction(action);

    if (requiresConfirmation) {
      const approvalNotification =
        await this.createHighRiskApprovalNotification({
          orgId,
          actorId: auditActorId,
          workspaceId,
          action,
          params,
          permission,
        });
      try {
        await this.audit.appendStrict({
          organizationId: orgId,
          actorId: auditActorId,
          action: `agent-proxy.${action}`,
          resourceType: 'AgentProxy',
          resourceId: action,
          after: {
            params,
            permission,
            status: 'pending_confirmation',
            notificationId: approvalNotification.id,
          },
        });
      } catch (error) {
        await this.notifications.remove(
          this.agentUser({ orgId, actorId: auditActorId }),
          approvalNotification.id,
        );
        throw error;
      }
      return {
        status: 'pending_confirmation',
        permission,
        action,
        notificationId: approvalNotification.id,
        requiresConfirmation: true,
      };
    }

    await this.audit.appendStrict({
      organizationId: orgId,
      actorId: auditActorId,
      action: `agent-proxy.${action}`,
      resourceType: 'AgentProxy',
      resourceId: action,
      after: { params, permission, status: 'accepted' },
    });

    const result = await this.executeAction(action, params, {
      orgId,
      actorId: auditActorId,
      workspaceId,
    });
    return { status: 'executed', permission, result };
  }

  /**
   * Route an action to the appropriate service call.
   * For actions that are handled by the agent itself (research, draft) we
   * acknowledge and forward — the agent processes these asynchronously.
   */
  private async executeAction(
    action: string,
    params: unknown,
    context: { orgId: string; actorId: string; workspaceId?: string },
  ): Promise<unknown> {
    const payload = this.asRecord(params);
    const registeredMcpTool = MCP_ACTION_TO_TOOL[action];
    if (registeredMcpTool) {
      return this.executeMcpTool(action, registeredMcpTool, payload, context);
    }
    switch (action) {
      case 'product.research':
        return this.createAgentRun('PRODUCT_RESEARCHER', payload, context);

      case 'listing.draft':
        return this.createAgentRun('LISTING_OPTIMIZER', payload, context);

      case 'keyword.analyze':
        return this.createAgentRun(
          'KEYWORD_EXPLORER',
          {
            seedKeywords: this.asStringArray(payload.seedKeywords),
            marketplace:
              this.asOptionalString(payload.marketplace) ?? 'amazon.com',
            locale: this.asOptionalString(payload.locale),
          },
          context,
        );

      case 'trend.analyze':
        return this.createAgentRun(
          'ADVERTISING_STRATEGIST',
          {
            category: this.asOptionalString(payload.category) ?? 'general',
            marketplace:
              this.asOptionalString(payload.marketplace) ?? 'amazon.com',
            timeframe: this.asOptionalString(payload.timeframe),
          },
          context,
        );

      case 'image.generate':
        return this.createAgentRun(
          'IMAGE_CREATIVE',
          {
            productName:
              this.asOptionalString(payload.productName) ??
              this.asOptionalString(payload.name) ??
              'Agent image task',
            imageBase64: this.asOptionalString(payload.imageBase64),
            imageUrl: this.asOptionalString(payload.imageUrl),
            sceneCount: this.asOptionalNumber(payload.sceneCount) ?? 5,
            platforms: Array.isArray(payload.platforms)
              ? payload.platforms.filter(
                  (item): item is string => typeof item === 'string',
                )
              : undefined,
            message: this.asOptionalString(payload.message),
          },
          context,
        );

      case 'profit.analyze':
        return this.calculateProfit(payload);

      case 'product.update':
        return this.updateProduct(payload, context);

      case 'notification.suggest':
        return this.autonomy.pushSuggestion({
          orgId: context.orgId,
          actorId: context.actorId,
          workspaceId: context.workspaceId,
          suggestion: this.asRecord(payload.suggestion ?? payload),
        });

      case 'task.schedule':
        return this.autonomy.scheduleSuggestion({
          orgId: context.orgId,
          actorId: context.actorId,
          workspaceId: context.workspaceId,
          suggestion: this.asRecord(payload.suggestion ?? payload),
          dueAt: this.asOptionalString(payload.dueAt),
        });

      case 'task.create':
        return {
          forwarded: true,
          note: 'Task creation forwarded to tasks API',
        };

      case 'operator.prepare_listing_batch':
        return this.autonomy.prepareListingBatch({
          orgId: context.orgId,
          actorId: context.actorId,
          workspaceId:
            context.workspaceId ?? this.asOptionalString(payload.workspaceId),
          productIds: this.asStringArray(payload.productIds),
          instruction: this.asOptionalString(payload.instruction),
        });

      case 'linkfoxskill.version':
        return this.linkfoxSkillCli.version();

      case 'linkfoxskill.agentlist':
        return this.linkfoxSkillCli.agentlist();

      case 'linkfoxskill.search':
        return this.linkfoxSkillCli.search(payload);

      case 'linkfoxskill.install':
        return this.linkfoxSkillCli.install(payload);

      case 'linkfoxskill.update':
        return this.linkfoxSkillCli.update(payload);

      default:
        return { status: 'unknown_action', action };
    }
  }

  private async createAgentRun(
    agentType:
      | 'PRODUCT_RESEARCHER'
      | 'LISTING_OPTIMIZER'
      | 'KEYWORD_EXPLORER'
      | 'ADVERTISING_STRATEGIST'
      | 'IMAGE_CREATIVE',
    input: Record<string, unknown>,
    context: { orgId: string; actorId: string; workspaceId?: string },
  ) {
    const run = await this.agentRuns.create(
      this.agentUser(context),
      {
        agentType,
        workspaceId: context.workspaceId,
        input,
      },
      this.asOptionalString(input.locale),
    );
    return {
      forwarded: true,
      agentRunId: run.id,
      status: run.status,
      agentType: run.agentType,
    };
  }

  private async executeMcpTool(
    action: string,
    toolName: CommerceMcpToolName,
    payload: Record<string, unknown>,
    context: { orgId: string; actorId: string; workspaceId?: string },
  ) {
    const trustStatus = await this.commerceMcpTrust.assertTrusted();
    if (context.workspaceId) {
      const workspace = await this.tenantDatabase.run(context.orgId, (tx) =>
        tx.workspace.findFirst({
          where: { id: context.workspaceId, organizationId: context.orgId },
          select: { id: true },
        }),
      );
      if (!workspace)
        throw new BadRequestException('Workspace not found for MCP invocation');
    }
    const startedAt = Date.now();
    const invocation = await this.tenantDatabase.run(context.orgId, (tx) =>
      tx.mcpToolInvocation.create({
        data: {
          organizationId: context.orgId,
          workspaceId: context.workspaceId,
          actorId: context.actorId,
          action,
          toolName,
          input: this.sanitizeMcpValue({
            payload,
            trust: {
              source: trustStatus.source,
              manifestHash: trustStatus.manifest.manifestHash,
              executableHash: trustStatus.manifest.executableHash,
              approvalType: trustStatus.approvalType,
              approvalExpiresAt: trustStatus.expiresAt,
            },
          }) as Prisma.InputJsonValue,
        },
      }),
    );
    try {
      const result = await this.commerceMcpClient.callTool(toolName, payload);
      this.assertTrustedMcpOutput(result);
      const durationMs = Date.now() - startedAt;
      await this.tenantDatabase.run(context.orgId, (tx) =>
        tx.mcpToolInvocation.update({
          where: { id: invocation.id },
          data: {
            status: 'COMPLETED',
            output: this.sanitizeMcpValue(result) as Prisma.InputJsonValue,
            durationMs,
            finishedAt: new Date(),
          },
        }),
      );
      if (result && typeof result === 'object' && !Array.isArray(result)) {
        return {
          ...(result as Record<string, unknown>),
          _mcp: {
            runId: invocation.id,
            toolName,
            durationMs,
            status: 'COMPLETED',
            manifestHash: trustStatus.manifest.manifestHash,
            executableHash: trustStatus.manifest.executableHash,
          },
        };
      }
      return {
        value: result,
        _mcp: {
          runId: invocation.id,
          toolName,
          durationMs,
          status: 'COMPLETED',
          manifestHash: trustStatus.manifest.manifestHash,
          executableHash: trustStatus.manifest.executableHash,
        },
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      await this.tenantDatabase.run(context.orgId, (tx) =>
        tx.mcpToolInvocation.update({
          where: { id: invocation.id },
          data: {
            status: 'FAILED',
            durationMs,
            errorCode:
              error instanceof BadRequestException
                ? 'MCP_TOOL_REJECTED'
                : 'MCP_TOOL_FAILED',
            errorMessage:
              error instanceof Error
                ? error.message.slice(0, 2000)
                : String(error).slice(0, 2000),
            finishedAt: new Date(),
          },
        }),
      );
      throw error;
    }
  }

  private sanitizeMcpValue(value: unknown, depth = 0): unknown {
    if (depth > 8) return '[depth-limit]';
    if (typeof value === 'string')
      return value.length > 10_000
        ? `${value.slice(0, 10_000)}[truncated]`
        : value;
    if (Array.isArray(value))
      return value
        .slice(0, 200)
        .map((item) => this.sanitizeMcpValue(item, depth + 1));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        /(token|secret|password|authorization|api.?key)/i.test(key)
          ? '[redacted]'
          : this.sanitizeMcpValue(item, depth + 1),
      ]),
    );
  }

  private assertTrustedMcpOutput(value: unknown) {
    const strings: string[] = [];
    const collect = (item: unknown, depth = 0) => {
      if (depth > 8 || strings.length > 500) return;
      if (typeof item === 'string') {
        strings.push(item);
        return;
      }
      if (Array.isArray(item)) {
        item.slice(0, 200).forEach((entry) => collect(entry, depth + 1));
        return;
      }
      if (item && typeof item === 'object') {
        Object.values(item as Record<string, unknown>).forEach((entry) =>
          collect(entry, depth + 1),
        );
      }
    };
    collect(value);
    const suspicious = strings.find((item) =>
      /(ignore (all |the )?(previous|prior) instructions|reveal (the )?(system prompt|api key|secret)|override (security|policy|permissions)|execute (this )?(shell|command))/i.test(
        item,
      ),
    );
    if (suspicious) {
      throw new BadRequestException(
        'MCP output blocked by instruction-injection policy',
      );
    }
  }

  private agentUser(context: { orgId: string; actorId: string }): JwtPayload {
    return {
      sub: context.actorId,
      email: 'agent-proxy@shopmate.local',
      orgId: context.orgId,
      role: 'OWNER',
    };
  }

  private calculateProfit(payload: Record<string, unknown>) {
    const salePrice = this.asRequiredNumber(payload.salePrice, 'salePrice');
    const productCost = this.asRequiredNumber(
      payload.productCost,
      'productCost',
    );
    const packagingCost = this.asOptionalNumber(payload.packagingCost) ?? 0;
    const shippingCost = this.asOptionalNumber(payload.shippingCost) ?? 0;
    const platformFee = this.asOptionalNumber(payload.platformFee) ?? 0;
    const paymentFee = this.asOptionalNumber(payload.paymentFee) ?? 0;
    const adCost = this.asOptionalNumber(payload.adCost) ?? 0;
    const storageCost = this.asOptionalNumber(payload.storageCost) ?? 0;
    const otherCost = this.asOptionalNumber(payload.otherCost) ?? 0;
    const totalCost =
      productCost +
      packagingCost +
      shippingCost +
      platformFee +
      paymentFee +
      adCost +
      storageCost +
      otherCost;
    const estimatedProfit = salePrice - totalCost;
    const profitMargin =
      salePrice > 0
        ? Math.round((estimatedProfit / salePrice) * 10000) / 100
        : 0;
    const roi =
      totalCost > 0
        ? Math.round((estimatedProfit / totalCost) * 10000) / 100
        : 0;
    return {
      salePrice,
      totalCost,
      estimatedProfit,
      profitMargin,
      roi,
      currency: this.asOptionalString(payload.currency) ?? 'USD',
    };
  }

  private async updateProduct(
    payload: Record<string, unknown>,
    context: { orgId: string },
  ) {
    const productId = this.asRequiredString(payload.productId, 'productId');
    const existing = await this.tenantDatabase.run(context.orgId, (tx) =>
      tx.product.findFirst({
        where: { id: productId, workspace: { organizationId: context.orgId } },
        select: { id: true },
      }),
    );
    if (!existing) {
      throw new NotFoundException('Product not found');
    }
    const data: Prisma.ProductUpdateInput = {
      title: this.asOptionalString(payload.title),
      sku: this.asOptionalString(payload.sku),
      asinOrExternalId: this.asOptionalString(payload.asinOrExternalId),
      images: Array.isArray(payload.images)
        ? payload.images.filter(
            (item): item is string => typeof item === 'string',
          )
        : undefined,
      cost: this.asOptionalNumber(payload.cost),
      price: this.asOptionalNumber(payload.price),
      currency: this.asOptionalString(payload.currency),
      status: this.asOptionalString(payload.status) as
        'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'DELETED' | undefined,
    };
    const updated = await this.tenantDatabase.run(context.orgId, (tx) =>
      tx.product.update({
        where: { id: existing.id },
        data,
        select: {
          id: true,
          title: true,
          sku: true,
          price: true,
          status: true,
        },
      }),
    );
    return updated;
  }

  private isHardConfirmationAction(action: string): boolean {
    if (action === 'ozon.pricing.calculate') {
      return false;
    }
    return (
      action === 'listing.publish' ||
      action === 'store.product.update' ||
      action === 'price.adjust' ||
      action === 'order.refund' ||
      action === 'payment.execute' ||
      action.endsWith('.publish') ||
      action.startsWith('ads.') ||
      action.startsWith('order.') ||
      action.startsWith('price.') ||
      action.startsWith('payment.') ||
      action.startsWith('ozon.') ||
      action === 'linkfoxskill.install' ||
      action === 'linkfoxskill.update'
    );
  }

  private async createHighRiskApprovalNotification(input: {
    orgId: string;
    actorId: string;
    workspaceId?: string;
    action: string;
    params?: unknown;
    permission: unknown;
  }) {
    const label = this.highRiskActionLabel(input.action);
    const params = this.asRecord(input.params);

    const created = await this.actionProposals.create({
      organizationId: input.orgId,
      requestedBy: input.actorId,
      approverId: input.actorId,
      source: 'agent_proxy',
      action: {
        label: 'Execute',
        name: input.action,
        params,
      },
      type: 'APPROVAL_REQUIRED',
      title: `请确认智能体高风险动作：${label}`,
      body:
        `智能体请求${label}。系统已拦截直接执行，请在通知中心选择“执行”或“不执行”。` +
        '当前不会无确认写入真实店铺。',
      context: {
        kind: 'high_risk_action_review',
        source: 'agent_proxy',
        riskLevel: 'high',
        requiresConfirmation: true,
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        permission: input.permission,
        action: {
          label: '执行',
          action: input.action,
          params,
        },
        execution: {
          status: 'pending_confirmation',
          externalStoreMutation: 'blocked_until_human_confirmation',
        },
        guardrails: [
          '禁止无确认修改真实店铺商品',
          '禁止无确认发布 Listing 到平台',
          '禁止无确认调价、投广告、处理订单或退款',
        ],
      },
    });
    return created.notification;
  }

  private highRiskActionLabel(action: string): string {
    if (action === 'linkfoxskill.install')
      return '安装 LinkFox 技能到本地 Agent';
    if (action === 'linkfoxskill.update') return '更新本地 LinkFox 技能';
    if (action === 'store.product.update') return '改变真实店铺商品';
    if (action === 'ozon.product.update') return '改变 Ozon 真实店铺商品';
    if (action === 'ozon.listing.publish') return '发布 Listing 到 Ozon';
    if (action === 'ozon.price.update') return 'Ozon 自动调价';
    if (action === 'ozon.stock.update') return '写入 Ozon 库存';
    if (action === 'ozon.order.refund') return '处理 Ozon 订单退款';
    if (action === 'ozon.ads.update') return '调整 Ozon 广告投放';
    if (action === 'listing.publish') return '发布 Listing 到平台';
    if (action === 'price.adjust' || action.startsWith('price.')) {
      return '自动调价';
    }
    if (action.startsWith('ads.')) return '自动投广告';
    if (action === 'order.refund') return '处理订单退款';
    if (action.startsWith('order.')) return '处理订单';
    if (action.startsWith('payment.')) return '执行付费操作';
    if (action.endsWith('.publish')) return '发布外部平台内容';
    return action;
  }

  private async auditUnauthorizedOperation(input: {
    orgId: string;
    actorId?: string;
    action: string;
    params?: unknown;
    reason: string;
    permission?: unknown;
  }): Promise<void> {
    const auditActorId = await this.resolveAuditActor(
      input.orgId,
      input.actorId,
    );
    if (!auditActorId) {
      return;
    }
    await this.audit.log({
      organizationId: input.orgId,
      actorId: auditActorId,
      action: 'agent-proxy.unauthorized',
      resourceType: 'AgentProxy',
      resourceId: input.action,
      after: {
        action: input.action,
        params: input.params,
        reason: input.reason,
        permission: input.permission,
      },
    });
  }

  private async resolveAuditActor(
    orgId: string,
    actorId?: string,
  ): Promise<string | undefined> {
    if (actorId) {
      return actorId;
    }
    try {
      return await this.autonomy.resolveActorForOrg(orgId);
    } catch {
      return undefined;
    }
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }

  private asOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value
      : undefined;
  }

  private asRequiredString(value: unknown, field: string): string {
    const text = this.asOptionalString(value);
    if (!text) {
      throw new BadRequestException(`${field} is required`);
    }
    return text;
  }

  private asOptionalNumber(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      throw new BadRequestException('number value is invalid');
    }
    return numberValue;
  }

  private asRequiredNumber(value: unknown, field: string): number {
    const numberValue = this.asOptionalNumber(value);
    if (numberValue === undefined) {
      throw new BadRequestException(`${field} is required`);
    }
    if (numberValue < 0) {
      throw new BadRequestException(`${field} must be non-negative`);
    }
    return numberValue;
  }

  private asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException('productIds must be an array of strings');
    }
    const productIds = value.filter(
      (item): item is string =>
        typeof item === 'string' && item.trim().length > 0,
    );
    if (productIds.length !== value.length) {
      throw new BadRequestException('productIds must be an array of strings');
    }
    return productIds;
  }
}

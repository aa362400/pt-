import {
  BadRequestException,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { $Enums } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import {
  assertWorkspaceInOrg,
  requireOrg,
} from '../../shared/tenancy/org-scope.js';
import type {
  ConnectOzonChannelDto,
  CreateChannelConnectionDto,
  ListChannelOrdersQueryDto,
  ListChannelsQueryDto,
  ListOzonRfbsReturnsQueryDto,
  RequestOzonRfbsRefundDto,
  SyncChannelOrdersDto,
  SyncChannelProductsDto,
  UpdateChannelConnectionDto,
  UpdateSyncStatusDto,
} from './channels.dto.js';
import { OzonCredentialsService } from './ozon-credentials.service.js';
import { OzonSellerApiClient } from './ozon-seller-api.client.js';
import { NotificationEventsService } from '../notifications/notification-events.service.js';
import { ActionProposalsService } from '../notifications/action-proposals.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantDatabase: TenantDatabaseContextService,
    private readonly ozonCredentials: OzonCredentialsService,
    private readonly ozonClient: OzonSellerApiClient,
    private readonly actionProposals: ActionProposalsService,
    @Optional()
    private readonly notificationEvents?: NotificationEventsService,
    @Optional()
    private readonly audit?: AuditService,
  ) {}

  async rotateOzonCredentials(user: JwtPayload) {
    const organizationId = requireOrg(user);
    if (!this.audit) {
      throw new InternalServerErrorException(
        'Audit service is required for credential rotation',
      );
    }
    const channels = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.channelConnection.findMany({
        where: {
          provider: 'OZON',
          workspace: { organizationId },
        },
        select: { id: true, accessTokenEncrypted: true },
        orderBy: { id: 'asc' },
      }),
    );
    const rotations = await Promise.all(
      channels.map(async (channel) => ({
        id: channel.id,
        ...(await this.ozonCredentials.rotate(channel.accessTokenEncrypted)),
      })),
    );
    const changed = rotations.filter((rotation) => rotation.changed);

    await this.audit.appendStrict({
      organizationId,
      actorId: user.sub,
      action: 'ozon.credentials.rotation.started',
      resourceType: 'ChannelConnection',
      resourceId: 'ozon-organization-credentials',
      after: {
        total: channels.length,
        pendingRotation: changed.length,
        targetKeyIds: [...new Set(changed.map((item) => item.toKeyId))],
      },
    });

    if (changed.length > 0) {
      await this.tenantDatabase.run(organizationId, (tx) =>
        Promise.all(
          changed.map((rotation) =>
            tx.channelConnection.update({
              where: { id: rotation.id },
              data: { accessTokenEncrypted: rotation.encoded },
            }),
          ),
        ),
      );
    }

    await this.audit.appendStrict({
      organizationId,
      actorId: user.sub,
      action: 'ozon.credentials.rotation.completed',
      resourceType: 'ChannelConnection',
      resourceId: 'ozon-organization-credentials',
      after: {
        total: channels.length,
        rotated: changed.length,
        unchanged: channels.length - changed.length,
        keyIds: [...new Set(rotations.map((item) => item.toKeyId))],
      },
    });

    return {
      total: channels.length,
      rotated: changed.length,
      unchanged: channels.length - changed.length,
      keyIds: [...new Set(rotations.map((item) => item.toKeyId))],
    };
  }

  async create(user: JwtPayload, dto: CreateChannelConnectionDto) {
    const orgId = requireOrg(user);
    await assertWorkspaceInOrg(this.prisma, orgId, dto.workspaceId);

    const channel = await this.tenantDatabase.run(orgId, (tx) =>
      tx.channelConnection.create({
        data: {
          workspaceId: dto.workspaceId,
          provider: dto.provider,
          externalShopId: dto.externalShopId,
          accessTokenEncrypted: dto.accessTokenEncrypted,
          refreshTokenEncrypted: dto.refreshTokenEncrypted ?? null,
          tokenExpiresAt: dto.tokenExpiresAt
            ? new Date(dto.tokenExpiresAt)
            : null,
        },
      }),
    );
    return this.withoutSecrets(channel);
  }

  async findAll(user: JwtPayload, query: ListChannelsQueryDto) {
    const orgId = requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.ChannelConnectionWhereInput = {
      workspace: { organizationId: orgId },
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
      ...(query.provider ? { provider: query.provider } : {}),
      ...(query.syncStatus
        ? { syncStatus: query.syncStatus as $Enums.ChannelSyncStatus }
        : {}),
    };

    const [items, total] = await this.tenantDatabase.run(orgId, (tx) =>
      Promise.all([
        tx.channelConnection.findMany({
          where,
          orderBy: { lastSyncedAt: { sort: 'desc', nulls: 'last' } },
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.channelConnection.count({ where }),
      ]),
    );
    return {
      items: items.map((item) => this.withoutSecrets(item)),
      total,
      page,
      limit,
    };
  }

  private async findOwned(orgId: string, id: string) {
    const channel = await this.tenantDatabase.run(orgId, (tx) =>
      tx.channelConnection.findFirst({
        where: { id, workspace: { organizationId: orgId } },
      }),
    );
    if (!channel) {
      throw new NotFoundException('Channel connection not found');
    }
    return channel;
  }

  async findOne(user: JwtPayload, id: string) {
    const channel = await this.findOwned(requireOrg(user), id);
    return this.withoutSecrets(channel);
  }

  async connectOzon(user: JwtPayload, dto: ConnectOzonChannelDto) {
    const orgId = requireOrg(user);
    const credentials = {
      clientId: dto.clientId.trim(),
      apiKey: dto.apiKey.trim(),
    };
    const verification = await this.ozonClient.verifyCredentials(credentials);
    const workspaceId = dto.workspaceId
      ? await this.resolveWorkspaceId(orgId, dto.workspaceId)
      : await this.createOzonWorkspace(user, dto.workspaceName);
    const externalShopId = dto.externalShopId ?? credentials.clientId;
    const encodedCredentials = await this.ozonCredentials.encode(credentials);

    let channel = await this.tenantDatabase.run(orgId, (tx) =>
      tx.channelConnection.upsert({
        where: { workspaceId_provider: { workspaceId, provider: 'OZON' } },
        create: {
          workspaceId,
          provider: 'OZON',
          externalShopId,
          accessTokenEncrypted: encodedCredentials,
          refreshTokenEncrypted: null,
          syncStatus: 'SUCCESS',
          lastSyncedAt: new Date(),
        },
        update: {
          externalShopId,
          accessTokenEncrypted: encodedCredentials,
          refreshTokenEncrypted: null,
          syncStatus: 'SUCCESS',
          lastSyncedAt: new Date(),
        },
      }),
    );
    let initialSync:
      | {
          status: 'success';
          fetched: number;
          synced: number;
        }
      | {
          status: 'failed';
          fetched: 0;
          synced: 0;
          error: string;
        };
    let initialOrderSync:
      | {
          status: 'success';
          fetched: number;
          synced: number;
          changed: number;
          warnings: Array<{ fulfillmentType: 'FBS' | 'FBO'; message: string }>;
        }
      | {
          status: 'failed';
          fetched: 0;
          synced: 0;
          warnings: [];
          error: string;
        };

    try {
      const syncResult = await this.syncProducts(user, channel.id, {
        limit: 50,
      });
      initialSync = {
        status: 'success',
        fetched: syncResult.fetched,
        synced: syncResult.synced,
      };
      channel = await this.findOwned(orgId, channel.id);
    } catch (error) {
      channel = await this.tenantDatabase.run(orgId, (tx) =>
        tx.channelConnection.update({
          where: { id: channel.id },
          data: {
            syncStatus: 'FAILED',
            lastSyncedAt: new Date(),
          },
        }),
      );
      initialSync = {
        status: 'failed',
        fetched: 0,
        synced: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    try {
      const orderSyncResult = await this.syncOrders(user, channel.id, {
        limit: 100,
      });
      initialOrderSync = {
        status: 'success',
        fetched: orderSyncResult.fetched,
        synced: orderSyncResult.synced,
        changed: orderSyncResult.changed,
        warnings: orderSyncResult.warnings,
      };
      channel = await this.findOwned(orgId, channel.id);
    } catch (error) {
      initialOrderSync = {
        status: 'failed',
        fetched: 0,
        synced: 0,
        warnings: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }

    return {
      channel: this.withoutSecrets(channel),
      verification,
      credentials: this.ozonCredentials.mask(credentials),
      capabilities: this.ozonCapabilities(channel),
      initialSync,
      initialOrderSync,
    };
  }

  async getCapabilities(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    const channel = await this.findOwned(orgId, id);
    return this.ozonCapabilities(channel);
  }

  async listRfbsReturns(
    user: JwtPayload,
    id: string,
    query: ListOzonRfbsReturnsQueryDto,
  ) {
    const organizationId = requireOrg(user);
    const channel = await this.findOwned(organizationId, id);
    this.assertOzonChannel(channel.provider);
    const credentials = await this.ozonCredentials.decode(
      channel.accessTokenEncrypted,
    );
    const result = await this.ozonClient.listRfbsReturns(credentials, {
      limit: query.limit,
      postingNumber: query.postingNumber?.trim() || undefined,
    });
    return {
      source: 'Ozon Seller API /v2/returns/rfbs/list',
      fetchedAt: new Date().toISOString(),
      channelId: channel.id,
      ...result,
    };
  }

  async getRfbsReturn(user: JwtPayload, id: string, returnIdValue: string) {
    const organizationId = requireOrg(user);
    const channel = await this.findOwned(organizationId, id);
    this.assertOzonChannel(channel.provider);
    const returnId = this.parseRfbsReturnId(returnIdValue);
    const credentials = await this.ozonCredentials.decode(
      channel.accessTokenEncrypted,
    );
    const item = await this.ozonClient.getRfbsReturn(credentials, returnId);
    return {
      source: 'Ozon Seller API /v2/returns/rfbs/get',
      fetchedAt: new Date().toISOString(),
      channelId: channel.id,
      item: {
        returnId: item.returnId,
        returnNumber: item.returnNumber,
        postingNumber: item.postingNumber,
        product: item.product,
        state: item.state,
        availableActions: item.availableActions,
        fullRefundAvailable: item.availableActions.some((action) =>
          this.isRfbsRefundActionName(action.name),
        ),
      },
    };
  }

  async requestRfbsRefund(
    user: JwtPayload,
    id: string,
    returnIdValue: string,
    dto: RequestOzonRfbsRefundDto,
  ) {
    const organizationId = requireOrg(user);
    const channel = await this.findOwned(organizationId, id);
    this.assertOzonChannel(channel.provider);
    if (dto.confirmFullRefund !== true) {
      throw new BadRequestException(
        'Full rFBS refund requires explicit confirmFullRefund acknowledgement',
      );
    }
    if (!this.audit) {
      throw new InternalServerErrorException(
        'Audit service is required for Ozon refund approval requests',
      );
    }

    const returnId = this.parseRfbsReturnId(returnIdValue);
    const credentials = await this.ozonCredentials.decode(
      channel.accessTokenEncrypted,
    );
    const item = await this.ozonClient.getRfbsReturn(credentials, returnId);
    const refundActions = item.availableActions.filter((action) =>
      this.isRfbsRefundActionName(action.name),
    );
    if (refundActions.length !== 1) {
      throw new BadRequestException(
        refundActions.length === 0
          ? 'Ozon does not currently expose a full-refund action for this return'
          : 'Ozon returned multiple full-refund actions; manual investigation is required',
      );
    }
    const refundAction = refundActions[0];
    const returnForBackWay = dto.returnForBackWay ?? 0;

    const { notification } = await this.actionProposals.create({
      organizationId,
      requestedBy: user.sub,
      approverId: user.sub,
      source: 'ozon_rfbs_returns',
      action: {
        label: 'Execute full refund',
        name: 'ozon.order.refund',
        params: {
          channelId: channel.id,
          workspaceId: channel.workspaceId,
          returnId,
          returnActionId: refundAction.id,
          refundScope: 'rfbs_full_return',
          confirmFullRefund: true,
          returnForBackWay,
        },
      },
      type: 'APPROVAL_REQUIRED',
      title: 'english_text Ozon rFBS english_text',
      body:
        `text ${item.returnNumber ?? returnId} english_texthumantext。` +
        'textyestextnotificationenglish_text“text”english_text Ozon，english_text。',
      context: {
        kind: 'high_risk_action_review',
        source: 'ozon_rfbs_returns',
        provider: 'OZON',
        riskLevel: 'high',
        requiresConfirmation: true,
        externalStoreMutation: 'blocked_until_human_confirmation',
        action: {
          label: 'english_text',
          action: 'ozon.order.refund',
          params: {
            channelId: channel.id,
            workspaceId: channel.workspaceId,
            returnId,
            returnActionId: refundAction.id,
            refundScope: 'rfbs_full_return',
            confirmFullRefund: true,
            returnForBackWay,
          },
        },
        preview: {
          returnNumber: item.returnNumber ?? null,
          postingNumber: item.postingNumber ?? null,
          product: {
            name: item.product.name ?? null,
            offerId: item.product.offerId ?? null,
            sku: item.product.sku ?? null,
            price: item.product.price ?? null,
            currencyCode: item.product.currencyCode ?? null,
          },
          state: {
            state: item.state.state ?? null,
            stateName: item.state.stateName ?? null,
            moneyReturnStateName: item.state.moneyReturnStateName ?? null,
          },
          action: refundAction,
          returnForBackWay,
        },
        execution: { status: 'pending_confirmation' },
        guardrails: [
          'english_text Ozon rFBS english_text',
          'requeststageenglish_text Ozon writeAPI',
          'notificationenglish_textwrite',
          'writeenglish_textstatus，noneenglish_textsuccess',
        ],
      },
    });

    await this.audit.appendStrict({
      organizationId,
      actorId: user.sub,
      action: 'ozon.rfbs-refund.requested',
      resourceType: 'Notification',
      resourceId: notification.id,
      after: {
        channelId: channel.id,
        returnId,
        returnActionId: refundAction.id,
        refundScope: 'rfbs_full_return',
        returnForBackWay,
        externalMutation: false,
        status: 'pending_human_confirmation',
      },
    });
    return {
      status: 'pending_human_confirmation',
      notificationId: notification.id,
      action: 'ozon.order.refund',
      returnId,
      externalMutation: false,
    };
  }

  async diagnoseOzon(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    const channel = await this.findOwned(orgId, id);
    this.assertOzonChannel(channel.provider);
    const checkedAt = new Date().toISOString();
    const syncLogs = await this.listOzonSyncLogs(orgId, channel.id);
    const capabilities = this.ozonCapabilities(channel);

    let credentials: { clientId: string; apiKey: string };
    try {
      credentials = await this.ozonCredentials.decode(
        channel.accessTokenEncrypted,
      );
    } catch (error) {
      const message = this.errorMessage(error);
      const probes = [
        this.failedProbe('credentials', 'Ozon credentialtext', message, checkedAt),
        this.skippedProbe(
          'product_catalog',
          'producttextAPI',
          'credentialnoneenglish_text，english_text Ozon productAPI。',
          checkedAt,
        ),
        this.skippedProbe(
          'fbs_orders',
          'FBS ordersAPI',
          'credentialnoneenglish_text，english_text Ozon FBS ordersAPI。',
          checkedAt,
        ),
        this.skippedProbe(
          'fbo_orders',
          'FBO ordersAPI',
          'credentialnoneenglish_text，english_text Ozon FBO ordersAPI。',
          checkedAt,
        ),
        this.skippedProbe(
          'rfbs_returns',
          'rFBS textAPI',
          'credentialnoneenglish_text，english_text Ozon rFBS textAPI。',
          checkedAt,
        ),
      ];
      return {
        channel: this.withoutSecrets(channel),
        checkedAt,
        overallStatus: 'failed',
        docs: capabilities.docs,
        probes,
        syncLogs,
        capabilities,
      };
    }

    const window = this.resolveOrderSyncWindow({ limit: 5 });
    const probes = [
      await this.runOzonDiagnosticProbe(
        'credentials',
        'Ozon credentialtext',
        checkedAt,
        async () => {
          const verification =
            await this.ozonClient.verifyCredentials(credentials);
          return {
            status: 'ok' as const,
            message: 'Ozon Seller API credentialtext。',
            total: verification.total,
            sampleCount: verification.sampleCount,
            lastId: verification.lastId,
          };
        },
      ),
      await this.runOzonDiagnosticProbe(
        'product_catalog',
        'producttextAPI',
        checkedAt,
        async () => {
          const refs = await this.ozonClient.listProductRefs(credentials, 5);
          return {
            status: 'ok' as const,
            message: 'producttextAPIenglish_text。',
            fetched: refs.length,
          };
        },
      ),
      await this.runOzonDiagnosticProbe(
        'fbs_orders',
        'FBS ordersAPI',
        checkedAt,
        async () => {
          const result = await this.ozonClient.probeOrderPostingEndpoint(
            credentials,
            'FBS',
            { ...window, limit: 5 },
          );
          return {
            status: 'ok' as const,
            message: 'FBS ordersAPIenglish_text。',
            fetched: result.fetched,
          };
        },
      ),
      await this.runOzonDiagnosticProbe(
        'fbo_orders',
        'FBO ordersAPI',
        checkedAt,
        async () => {
          const result = await this.ozonClient.probeOrderPostingEndpoint(
            credentials,
            'FBO',
            { ...window, limit: 5 },
          );
          return {
            status: 'ok' as const,
            message: 'FBO ordersAPIenglish_text。',
            fetched: result.fetched,
          };
        },
      ),
      await this.runOzonDiagnosticProbe(
        'rfbs_returns',
        'rFBS textAPI',
        checkedAt,
        async () => {
          const result = await this.ozonClient.listRfbsReturns(credentials, {
            limit: 5,
          });
          return {
            status: 'ok' as const,
            message: 'rFBS textAPIenglish_text。',
            fetched: result.items.length,
            hasNext: result.hasNext,
          };
        },
      ),
    ];

    return {
      channel: this.withoutSecrets(channel),
      checkedAt,
      overallStatus: this.resolveDiagnosticStatus(probes),
      docs: capabilities.docs,
      probes,
      syncLogs,
      capabilities,
    };
  }

  async syncProducts(
    user: JwtPayload,
    id: string,
    dto: SyncChannelProductsDto,
  ) {
    const orgId = requireOrg(user);
    const channel = await this.findOwned(orgId, id);
    this.assertOzonChannel(channel.provider);
    try {
      const credentials = await this.ozonCredentials.decode(
        channel.accessTokenEncrypted,
      );
      const refs = await this.ozonClient.listAllProductRefs(credentials, {
        maxItems: dto.limit,
      });
      const infos = [];
      for (let offset = 0; offset < refs.length; offset += 100) {
        infos.push(
          ...(await this.ozonClient.getProductInfoList(
            credentials,
            refs.slice(offset, offset + 100),
          )),
        );
      }
      const synced = [];

      for (const info of infos) {
        const externalId = info.productId
          ? String(info.productId)
          : info.offerId;
        if (!externalId) {
          continue;
        }
        const data = {
          title: info.name ?? `Ozon product ${externalId}`,
          sku: info.offerId,
          asinOrExternalId: externalId,
          images: info.images,
          price: this.asNumber(info.price) ?? 0,
          currency: info.currencyCode ?? 'RUB',
          status: 'ACTIVE' as const,
          metadata: {
            source: 'ozon',
            channelId: channel.id,
            productId: info.productId,
            offerId: info.offerId,
            ozonStatus: info.status,
            syncedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        };
        const product = await this.tenantDatabase.run(orgId, async (tx) => {
          const identities = [
            externalId,
            info.offerId,
            info.productId ? String(info.productId) : undefined,
          ].filter((value): value is string => Boolean(value));
          const candidates = await tx.product.findMany({
            where: {
              workspaceId: channel.workspaceId,
              OR: [
                { asinOrExternalId: { in: identities } },
                ...(info.offerId ? [{ sku: info.offerId }] : []),
              ],
            },
            select: { id: true, metadata: true },
          });
          const existing = candidates.find((candidate) => {
            const metadata = this.asRecord(candidate.metadata);
            return (
              metadata.source === 'ozon' && metadata.channelId === channel.id
            );
          });
          return existing
            ? tx.product.update({ where: { id: existing.id }, data })
            : tx.product.create({
                data: { workspaceId: channel.workspaceId, cost: 0, ...data },
              });
        });
        synced.push(product);
      }

      await this.tenantDatabase.run(orgId, (tx) =>
        tx.channelConnection.update({
          where: { id: channel.id },
          data: {
            syncStatus: 'SUCCESS',
            lastSyncedAt: new Date(),
          },
        }),
      );

      const response = {
        channelId: channel.id,
        provider: 'OZON',
        fetched: refs.length,
        synced: synced.length,
        items: synced,
        capabilities: this.ozonCapabilities({
          ...channel,
          syncStatus: 'SUCCESS',
        }),
      };
      await this.emitOzonSyncNotification(user, channel, {
        syncType: 'product_catalog',
        status: 'success',
        fetched: response.fetched,
        synced: response.synced,
      });
      await this.audit?.log({
        organizationId: orgId,
        actorId: user.sub,
        action: 'ozon.product-sync.completed',
        resourceType: 'ChannelConnection',
        resourceId: channel.id,
        after: {
          fetched: response.fetched,
          synced: response.synced,
          externalMutation: false,
          source: 'Ozon Seller API',
          syncedAt: new Date().toISOString(),
        },
      });
      return response;
    } catch (error) {
      await this.emitOzonSyncNotification(user, channel, {
        syncType: 'product_catalog',
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
      await this.audit?.log({
        organizationId: orgId,
        actorId: user.sub,
        action: 'ozon.product-sync.failed',
        resourceType: 'ChannelConnection',
        resourceId: channel.id,
        after: {
          error: error instanceof Error ? error.message : String(error),
          externalMutation: false,
          source: 'Ozon Seller API',
          failedAt: new Date().toISOString(),
        },
      });
      throw error;
    }
  }

  async syncOrders(user: JwtPayload, id: string, dto: SyncChannelOrdersDto) {
    const orgId = requireOrg(user);
    const channel = await this.findOwned(orgId, id);
    this.assertOzonChannel(channel.provider);
    try {
      const credentials = await this.ozonCredentials.decode(
        channel.accessTokenEncrypted,
      );
      const window = this.resolveOrderSyncWindow(dto);
      const orderResult = await this.ozonClient.listOrderPostings(credentials, {
        ...window,
        limit: dto.limit ?? 100,
      });
      const { synced, changed, affectedDates } = await this.tenantDatabase.run(
        orgId,
        async (tx) => {
          const syncedOrders = [];
          let changedOrders = 0;
          const dates = new Set<string>();
          for (const posting of orderResult.items) {
            const orderedAt = this.asDate(posting.orderedAt);
            const deliveredAt = this.asDate(posting.deliveredAt);
            const syncedAt = new Date().toISOString();
            const uniqueOrder = {
              organizationId_provider_externalPostingNumber: {
                organizationId: orgId,
                provider: 'OZON',
                externalPostingNumber: posting.postingNumber,
              },
            } as const;
            const existingOrder = await tx.marketplaceOrder.findUnique({
              where: uniqueOrder,
              select: {
                status: true,
                totalAmount: true,
                itemCount: true,
                orderedAt: true,
                deliveredAt: true,
              },
            });
            if (
              !existingOrder ||
              existingOrder.status !== posting.status ||
              this.asNumber(existingOrder.totalAmount) !==
                posting.totalAmount ||
              existingOrder.itemCount !== posting.itemCount ||
              !this.sameDate(existingOrder.orderedAt, orderedAt) ||
              !this.sameDate(existingOrder.deliveredAt, deliveredAt)
            ) {
              changedOrders += 1;
            }
            const order = await tx.marketplaceOrder.upsert({
              where: uniqueOrder,
              create: {
                organizationId: orgId,
                workspaceId: channel.workspaceId,
                channelId: channel.id,
                provider: 'OZON',
                fulfillmentType: posting.fulfillmentType,
                externalOrderId: posting.orderId ?? null,
                externalPostingNumber: posting.postingNumber,
                status: posting.status,
                orderedAt,
                deliveredAt,
                currency: posting.currencyCode ?? 'RUB',
                totalAmount: posting.totalAmount,
                itemCount: posting.itemCount,
                raw: { ...posting.raw, syncedAt },
              },
              update: {
                channelId: channel.id,
                fulfillmentType: posting.fulfillmentType,
                externalOrderId: posting.orderId ?? null,
                status: posting.status,
                orderedAt,
                deliveredAt,
                currency: posting.currencyCode ?? 'RUB',
                totalAmount: posting.totalAmount,
                itemCount: posting.itemCount,
                raw: { ...posting.raw, syncedAt },
              },
            });
            syncedOrders.push(order);
            dates.add(
              this.normalizeMetricDate(orderedAt ?? new Date()).toISOString(),
            );
          }
          return {
            synced: syncedOrders,
            changed: changedOrders,
            affectedDates: dates,
          };
        },
      );

      await this.refreshStoreMetricsFromOrders(
        orgId,
        channel.workspaceId,
        Array.from(affectedDates).map((value) => new Date(value)),
        {
          channelId: channel.id,
          since: window.since,
          to: window.to,
        },
      );

      await this.tenantDatabase.run(orgId, (tx) =>
        tx.channelConnection.update({
          where: { id: channel.id },
          data: {
            syncStatus: 'SUCCESS',
            lastSyncedAt: new Date(),
          },
        }),
      );

      const response = {
        channelId: channel.id,
        provider: 'OZON',
        fetched: orderResult.items.length,
        synced: synced.length,
        changed,
        warnings: orderResult.failures,
        items: synced,
        capabilities: this.ozonCapabilities({
          ...channel,
          syncStatus: 'SUCCESS',
        }),
      };
      await this.emitOzonSyncNotification(user, channel, {
        syncType: 'orders',
        status: 'success',
        fetched: response.fetched,
        synced: response.synced,
        changed: response.changed,
        warnings: response.warnings,
      });
      await this.audit?.log({
        organizationId: orgId,
        actorId: user.sub,
        action: 'ozon.order-sync.completed',
        resourceType: 'ChannelConnection',
        resourceId: channel.id,
        after: {
          fetched: response.fetched,
          synced: response.synced,
          changed: response.changed,
          warningCount: response.warnings.length,
          externalMutation: false,
          source: 'Ozon Seller API',
          syncedAt: new Date().toISOString(),
        },
      });
      return response;
    } catch (error) {
      await this.emitOzonSyncNotification(user, channel, {
        syncType: 'orders',
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
      await this.audit?.log({
        organizationId: orgId,
        actorId: user.sub,
        action: 'ozon.order-sync.failed',
        resourceType: 'ChannelConnection',
        resourceId: channel.id,
        after: {
          error: error instanceof Error ? error.message : String(error),
          externalMutation: false,
          source: 'Ozon Seller API',
          failedAt: new Date().toISOString(),
        },
      });
      throw error;
    }
  }

  async listOrders(user: JwtPayload, query: ListChannelOrdersQueryDto) {
    const orgId = requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    if (query.workspaceId) {
      await assertWorkspaceInOrg(this.prisma, orgId, query.workspaceId);
    }

    const where: Prisma.MarketplaceOrderWhereInput = {
      organizationId: orgId,
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
      ...(query.channelId ? { channelId: query.channelId } : {}),
      ...(query.provider ? { provider: query.provider } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              {
                externalOrderId: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                externalPostingNumber: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.tenantDatabase.run(orgId, (tx) =>
      Promise.all([
        tx.marketplaceOrder.findMany({
          where,
          orderBy: [
            { orderedAt: { sort: 'desc', nulls: 'last' } },
            { createdAt: 'desc' },
          ],
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.marketplaceOrder.count({ where }),
      ]),
    );
    return { items, total, page, limit };
  }

  async update(user: JwtPayload, id: string, dto: UpdateChannelConnectionDto) {
    const orgId = requireOrg(user);
    const existing = await this.findOwned(orgId, id);

    const channel = await this.tenantDatabase.run(orgId, (tx) =>
      tx.channelConnection.update({
        where: { id: existing.id },
        data: {
          externalShopId: dto.externalShopId,
          accessTokenEncrypted: dto.accessTokenEncrypted,
          refreshTokenEncrypted: dto.refreshTokenEncrypted,
          tokenExpiresAt: dto.tokenExpiresAt
            ? new Date(dto.tokenExpiresAt)
            : undefined,
          syncStatus: dto.syncStatus as $Enums.ChannelSyncStatus | undefined,
        },
      }),
    );
    return this.withoutSecrets(channel);
  }

  async remove(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    const existing = await this.findOwned(orgId, id);
    await this.tenantDatabase.run(orgId, (tx) =>
      tx.channelConnection.delete({ where: { id: existing.id } }),
    );
    return { id: existing.id };
  }

  async updateSyncStatus(
    user: JwtPayload,
    id: string,
    dto: UpdateSyncStatusDto,
  ) {
    const orgId = requireOrg(user);
    const existing = await this.findOwned(orgId, id);

    const channel = await this.tenantDatabase.run(orgId, (tx) =>
      tx.channelConnection.update({
        where: { id: existing.id },
        data: {
          syncStatus: dto.syncStatus as $Enums.ChannelSyncStatus,
          ...(dto.syncStatus === 'SUCCESS' || dto.syncStatus === 'FAILED'
            ? { lastSyncedAt: new Date() }
            : {}),
        },
      }),
    );
    return this.withoutSecrets(channel);
  }

  async disconnect(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    const existing = await this.findOwned(orgId, id);

    const channel = await this.tenantDatabase.run(orgId, (tx) =>
      tx.channelConnection.update({
        where: { id: existing.id },
        data: {
          syncStatus: 'DISCONNECTED',
        },
      }),
    );
    return this.withoutSecrets(channel);
  }

  private async emitOzonSyncNotification(
    user: JwtPayload,
    channel: {
      id: string;
      workspaceId: string;
      externalShopId?: string | null;
    },
    input:
      | {
          syncType: 'product_catalog' | 'orders';
          status: 'success';
          fetched: number;
          synced: number;
          changed?: number;
          warnings?: Array<{ fulfillmentType: 'FBS' | 'FBO'; message: string }>;
        }
      | {
          syncType: 'product_catalog' | 'orders';
          status: 'failed';
          error: string;
        },
  ): Promise<void> {
    try {
      const orgId = requireOrg(user);
      const syncName =
        input.syncType === 'orders' ? 'Ozon orderssync' : 'Ozon productsync';
      const hasWarnings =
        input.status === 'success' && (input.warnings?.length ?? 0) > 0;
      if (
        input.status === 'success' &&
        (input.changed ?? input.synced) === 0 &&
        !hasWarnings
      ) {
        return;
      }
      const notification = await this.tenantDatabase.run(orgId, (tx) =>
        tx.notification.create({
          data: {
            organizationId: orgId,
            userId: user.sub,
            type:
              input.status === 'failed' || hasWarnings
                ? 'ALERT'
                : 'REPORT_READY',
            title:
              input.status === 'success'
                ? `${syncName}completed`
                : `${syncName}failed`,
            body:
              input.status === 'success'
                ? `realAPIenglish_text ${input.fetched} text，write/text ${input.synced} text，text/text ${input.changed ?? input.synced} text。${
                    hasWarnings
                      ? `english_text：${input.warnings
                          ?.map(
                            (warning) =>
                              `${warning.fulfillmentType} ${warning.message}`,
                          )
                          .join('；')}`
                      : ''
                  }`
                : `realAPIsyncfailed：${input.error}`,
            metadata: {
              kind: 'ozon_sync_result',
              provider: 'OZON',
              source: 'ozon-seller-api',
              channelId: channel.id,
              workspaceId: channel.workspaceId,
              externalShopId: channel.externalShopId,
              syncType: input.syncType,
              status: input.status,
              ...(input.status === 'success'
                ? {
                    fetched: input.fetched,
                    synced: input.synced,
                    changed: input.changed ?? input.synced,
                    warnings: input.warnings ?? [],
                  }
                : { error: input.error }),
            },
          },
        }),
      );
      this.notificationEvents?.publishCreated(notification);
    } catch {
      // syncenglish_textnotificationwritefailedtextrollback；frontendenglish_textAPIresponse。
    }
  }

  private async resolveWorkspaceId(
    orgId: string,
    workspaceId: string,
  ): Promise<string> {
    await assertWorkspaceInOrg(this.prisma, orgId, workspaceId);
    return workspaceId;
  }

  private async createOzonWorkspace(
    user: JwtPayload,
    workspaceName?: string,
  ): Promise<string> {
    const orgId = requireOrg(user);
    const workspace = await this.tenantDatabase.run(orgId, (tx) =>
      tx.workspace.create({
        data: {
          organizationId: orgId,
          name: workspaceName ?? 'Ozon',
          channelType: 'OZON',
          marketplace: 'OZON_RU',
          currency: 'RUB',
          timezone: 'Europe/Moscow',
        },
        select: { id: true },
      }),
    );
    return workspace.id;
  }

  private ozonCapabilities(channel: {
    id: string;
    provider: string;
    syncStatus: $Enums.ChannelSyncStatus;
  }) {
    this.assertOzonChannel(channel.provider);
    const connected = channel.syncStatus === 'SUCCESS';
    return {
      provider: 'OZON',
      channelId: channel.id,
      connected,
      source: 'ozon-seller-api',
      docs: 'https://docs.ozon.ru/api/seller/',
      features: [
        {
          key: 'product_catalog',
          label: 'producttextsync',
          status: connected ? 'connected' : 'pending_credentials',
          mode: 'read',
        },
        {
          key: 'order_sync',
          label: 'orderssync',
          status: connected ? 'connected' : 'pending_credentials',
          mode: 'read',
        },
        {
          key: 'listing_draft',
          label: 'Listing textgeneration',
          status: connected ? 'connected' : 'pending_credentials',
          mode: 'local_draft',
        },
        {
          key: 'price_update',
          label: 'Ozon text',
          status: 'human_confirmation_required',
          mode: 'write_guarded',
        },
        {
          key: 'stock_update',
          label: 'Ozon textwrite',
          status: 'human_confirmation_required',
          mode: 'write_guarded',
        },
        {
          key: 'refunds',
          label: 'rFBS english_text',
          status: connected
            ? 'human_confirmation_required'
            : 'pending_credentials',
          mode: 'write_guarded',
        },
        {
          key: 'ads',
          label: 'english_text',
          status: 'not_connected',
          mode: 'adapter_required',
        },
      ],
    };
  }

  private assertOzonChannel(provider: string): void {
    if (provider !== 'OZON') {
      throw new BadRequestException(
        'This operation is only available for Ozon channels',
      );
    }
  }

  private parseRfbsReturnId(value: string): number {
    const returnId = Number(value);
    if (!Number.isInteger(returnId) || returnId <= 0) {
      throw new BadRequestException(
        'Ozon rFBS return_id must be a positive integer',
      );
    }
    return returnId;
  }

  private isRfbsRefundActionName(value: string): boolean {
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
    return (
      ['return_money', 'money_return', 'full_refund', 'refund_money'].includes(
        normalized,
      ) ||
      /(?:вернуть|возврат).*(?:деньг|средств)/iu.test(value) ||
      /(?:деньг|средств).*(?:вернуть|возврат)/iu.test(value)
    );
  }

  private withoutSecrets<
    T extends {
      accessTokenEncrypted?: string;
      refreshTokenEncrypted?: string | null;
    },
  >(channel: T): Omit<T, 'accessTokenEncrypted' | 'refreshTokenEncrypted'> {
    const {
      accessTokenEncrypted: _accessToken,
      refreshTokenEncrypted: _refresh,
      ...safe
    } = channel;
    return safe;
  }

  private async runOzonDiagnosticProbe(
    key: string,
    label: string,
    checkedAt: string,
    action: () => Promise<Record<string, unknown> & { status: 'ok' }>,
  ) {
    try {
      return { key, label, checkedAt, ...(await action()) };
    } catch (error) {
      return this.failedProbe(key, label, this.errorMessage(error), checkedAt);
    }
  }

  private failedProbe(
    key: string,
    label: string,
    message: string,
    checkedAt: string,
  ) {
    return {
      key,
      label,
      status: 'failed' as const,
      message,
      checkedAt,
    };
  }

  private skippedProbe(
    key: string,
    label: string,
    message: string,
    checkedAt: string,
  ) {
    return {
      key,
      label,
      status: 'skipped' as const,
      message,
      checkedAt,
    };
  }

  private resolveDiagnosticStatus(
    probes: Array<{ key: string; status: string }>,
  ): 'ok' | 'warning' | 'failed' {
    const credentials = probes.find((probe) => probe.key === 'credentials');
    if (credentials?.status === 'failed') return 'failed';
    if (probes.some((probe) => probe.status === 'failed')) return 'warning';
    return 'ok';
  }

  private async listOzonSyncLogs(orgId: string, channelId: string) {
    const notifications = await this.tenantDatabase.run(orgId, (tx) =>
      tx.notification.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    );
    return notifications
      .map((notification) => {
        const metadata = this.asRecord(notification.metadata);
        if (
          metadata.kind !== 'ozon_sync_result' ||
          metadata.channelId !== channelId
        ) {
          return null;
        }
        return {
          id: notification.id,
          type: notification.type,
          title: notification.title,
          body: notification.body,
          createdAt: notification.createdAt,
          syncType: this.asOptionalString(metadata.syncType) ?? 'unknown',
          status: this.asOptionalString(metadata.status) ?? 'unknown',
          fetched: this.asNumber(metadata.fetched),
          synced: this.asNumber(metadata.synced),
          changed: this.asNumber(metadata.changed),
          error: this.asOptionalString(metadata.error),
          warnings: Array.isArray(metadata.warnings)
            ? metadata.warnings
                .map((warning) => this.asRecord(warning))
                .map((warning) => ({
                  fulfillmentType:
                    this.asOptionalString(warning.fulfillmentType) ?? 'UNKNOWN',
                  message: this.asOptionalString(warning.message) ?? '',
                }))
            : [],
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .slice(0, 10);
  }

  private errorMessage(error: unknown): string {
    if (error instanceof BadRequestException) {
      const response = error.getResponse();
      if (typeof response === 'string') return response;
      const body = this.asRecord(response);
      const message = this.asOptionalString(body.message);
      const details = this.asRecord(body.details);
      const detailMessage = this.asOptionalString(details.message);
      return detailMessage ?? message ?? error.message;
    }
    return error instanceof Error ? error.message : String(error);
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private asOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value
      : undefined;
  }

  private asNumber(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : undefined;
  }

  private resolveOrderSyncWindow(dto: SyncChannelOrdersDto): {
    since: string;
    to: string;
  } {
    const to = dto.to ? new Date(dto.to) : new Date();
    const since = dto.since ? new Date(dto.since) : new Date(to);
    if (!dto.since) {
      since.setUTCDate(since.getUTCDate() - 30);
    }
    if (Number.isNaN(since.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid Ozon order sync date range');
    }
    if (since >= to) {
      throw new BadRequestException('Ozon order sync since must be before to');
    }
    return { since: since.toISOString(), to: to.toISOString() };
  }

  private asDate(value?: string): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private sameDate(left: Date | null, right: Date | null): boolean {
    if (!left && !right) return true;
    if (!left || !right) return false;
    return left.getTime() === right.getTime();
  }

  private normalizeMetricDate(value: Date): Date {
    const date = new Date(value);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }

  private async refreshStoreMetricsFromOrders(
    organizationId: string,
    workspaceId: string,
    dates: Date[],
    metadata: { channelId: string; since: string; to: string },
  ): Promise<void> {
    for (const date of dates) {
      const from = this.normalizeMetricDate(date);
      const to = new Date(from);
      to.setUTCDate(to.getUTCDate() + 1);
      await this.tenantDatabase.run(organizationId, async (tx) => {
        const summary = await tx.marketplaceOrder.aggregate({
          where: {
            workspaceId,
            provider: 'OZON',
            orderedAt: {
              gte: from,
              lt: to,
            },
          },
          _count: { _all: true },
          _sum: { totalAmount: true },
        });
        const existing = await tx.storeMetricSnapshot.findUnique({
          where: { workspaceId_date: { workspaceId, date: from } },
          select: { metadata: true },
        });
        const existingMetadata =
          existing?.metadata &&
          typeof existing.metadata === 'object' &&
          !Array.isArray(existing.metadata)
            ? (existing.metadata as Record<string, unknown>)
            : {};
        await tx.storeMetricSnapshot.upsert({
          where: { workspaceId_date: { workspaceId, date: from } },
          update: {
            orders: summary._count._all,
            revenue: Number(summary._sum.totalAmount ?? 0),
            metadata: {
              ...existingMetadata,
              orderSync: {
                source: 'ozon-seller-api',
                channelId: metadata.channelId,
                since: metadata.since,
                to: metadata.to,
                syncedAt: new Date().toISOString(),
              },
            },
          },
          create: {
            workspaceId,
            date: from,
            orders: summary._count._all,
            revenue: Number(summary._sum.totalAmount ?? 0),
            metadata: {
              orderSync: {
                source: 'ozon-seller-api',
                channelId: metadata.channelId,
                since: metadata.since,
                to: metadata.to,
                syncedAt: new Date().toISOString(),
              },
            },
          },
        });
      });
    }
  }
}

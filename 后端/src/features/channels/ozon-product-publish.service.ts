import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service.js';
import type { LocalProductRecord } from '../marketplace-compiler/canonical-catalog.service.js';
import type { OzonProductImportInput } from './ozon-seller-api.client.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import { ListingPublishSnapshotService } from '../product-launch/listing-publish-snapshot.service.js';
import {
  OzonChannelAdapter,
  OzonChannelAdapterError,
} from './ozon-channel-adapter.service.js';
import {
  OzonPublishPolicyService,
  type OzonPublishPolicyEvaluation,
} from './ozon-publish-policy.service.js';

export type OzonProductPublishStatus =
  'ACTIVE_ON_OZON' | 'SUBMITTED_TO_OZON' | 'BLOCKED' | 'FAILED';

export interface OzonProductPublishResult {
  status: OzonProductPublishStatus;
  code?: string;
  message?: string;
  channelId?: string;
  taskId?: number;
  externalProductId?: number;
  externalStatus?: string;
  evidence?: Record<string, unknown>;
}

interface OzonPublishHooks {
  beforeDispatch?: () => Promise<void>;
}

@Injectable()
export class OzonProductPublishService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channelAdapter: OzonChannelAdapter,
    private readonly publishPolicy: OzonPublishPolicyService,
    private readonly tenantDatabase: TenantDatabaseContextService,
    private readonly publishSnapshots: ListingPublishSnapshotService,
  ) {}

  /**
   * Validates every prerequisite except generated media. This prevents image
   * spend when the canonical product cannot compile for Ozon.
   */
  async preflightProduct(input: {
    organizationId: string;
    productId: string;
  }): Promise<OzonProductPublishResult | null> {
    const product = await this.findProduct(input);
    if (!product) {
      return this.productNotFound();
    }

    const channel = await this.findChannel(
      input.organizationId,
      product.workspaceId,
    );
    if (!channel) {
      return this.channelNotConnected();
    }

    const policy = this.publishPolicy.evaluateProduct(product, 'PREFLIGHT');
    if (policy.decision === 'BLOCK')
      return this.blockedByPolicy(channel.id, policy);

    try {
      await this.channelAdapter.open(channel.accessTokenEncrypted);
    } catch (error) {
      return this.failed(channel.id, 'OZON_CREDENTIALS_INVALID', error, {
        compilation: policy.evidence,
      });
    }
    return null;
  }

  async publishProduct(input: {
    organizationId: string;
    productId: string;
  }): Promise<OzonProductPublishResult> {
    const product = await this.findProduct(input);
    if (!product) {
      return this.productNotFound();
    }

    const channel = await this.findChannel(
      input.organizationId,
      product.workspaceId,
    );
    if (!channel) {
      return this.channelNotConnected();
    }

    const policy = this.publishPolicy.evaluateProduct(product, 'PUBLISH');
    if (policy.decision === 'BLOCK')
      return this.blockedByPolicy(channel.id, policy);

    return this.publishPayload(channel, policy.payload, policy.evidence);
  }

  async preflightSnapshot(input: {
    organizationId: string;
    snapshotId: string;
    expectedSnapshotHash: string;
  }): Promise<OzonProductPublishResult | null> {
    const stored = await this.publishSnapshots.loadApproved(input);
    const channel = await this.findChannelById(
      input.organizationId,
      stored.snapshot.channelId,
    );
    if (!channel) return this.channelNotConnected();
    let session;
    try {
      session = await this.channelAdapter.open(channel.accessTokenEncrypted);
    } catch (error) {
      return this.failed(channel.id, 'OZON_CREDENTIALS_INVALID', error, {
        snapshotId: stored.id,
        snapshotHash: stored.snapshotHash,
      });
    }
    const infos = await session.getProductInfoList([
      { offerId: stored.snapshot.payload.offerId },
    ]);
    const info = infos.find(
      (item) => item.offerId === stored.snapshot.payload.offerId,
    );
    if (!info) return null;
    const active = this.publishPolicy.isActiveExternalStatus(info.status);
    return {
      status: active ? 'ACTIVE_ON_OZON' : 'SUBMITTED_TO_OZON',
      channelId: channel.id,
      externalProductId: info.productId,
      externalStatus: info.status,
      message: active
        ? 'Ozon 只读回查确认该商品已处于可售状态。'
        : 'Ozon 只读回查已找到该商品，正在等待平台处理或审核。',
      evidence: {
        source: 'ozon_offer_readback',
        checkedAt: new Date().toISOString(),
        snapshotId: stored.id,
        snapshotHash: stored.snapshotHash,
        offerId: stored.snapshot.payload.offerId,
      },
    };
  }

  async publishSnapshot(
    input: {
      organizationId: string;
      snapshotId: string;
      expectedSnapshotHash: string;
    },
    hooks: OzonPublishHooks = {},
  ): Promise<OzonProductPublishResult> {
    const stored = await this.publishSnapshots.loadApproved(input);
    const channel = await this.findChannelById(
      input.organizationId,
      stored.snapshot.channelId,
    );
    if (!channel) return this.channelNotConnected();
    return this.publishPayload(
      channel,
      stored.snapshot.payload,
      {
        source: 'approved_publish_snapshot',
        snapshotId: stored.id,
        snapshotHash: stored.snapshotHash,
        listingApprovalHash: stored.listingApprovalHash,
        compilation: stored.snapshot.compilation,
      },
      hooks,
    );
  }

  private async publishPayload(
    channel: { id: string; accessTokenEncrypted: string },
    payload: OzonProductImportInput,
    compilationEvidence: Record<string, unknown>,
    hooks: OzonPublishHooks = {},
  ): Promise<OzonProductPublishResult> {
    let session;
    try {
      session = await this.channelAdapter.open(channel.accessTokenEncrypted);
    } catch (error) {
      return this.failed(channel.id, 'OZON_CREDENTIALS_INVALID', error, {
        compilation: compilationEvidence,
      });
    }

    let imported;
    await hooks.beforeDispatch?.();
    try {
      imported = await session.importProducts([payload]);
    } catch (error) {
      if (
        error instanceof OzonChannelAdapterError &&
        error.category === 'REQUEST_REJECTED'
      ) {
        return this.failed(channel.id, 'OZON_IMPORT_REJECTED', error, {
          compilation: compilationEvidence,
        });
      }
      if (
        error instanceof OzonChannelAdapterError &&
        error.outcomeUnknown &&
        error.originalError instanceof Error
      ) {
        throw error.originalError;
      }
      throw error;
    }
    if (!imported.taskId) {
      return {
        status: 'FAILED',
        code: 'OZON_IMPORT_TASK_MISSING',
        message: 'Ozon 未返回商品导入任务 ID，商品不会被标记为已上架。',
        channelId: channel.id,
        evidence: {
          compilation: compilationEvidence,
          response: imported.raw,
        },
      };
    }

    let importInfo;
    try {
      importInfo = await session.getProductImportInfo(imported.taskId);
    } catch (error) {
      return {
        status: 'SUBMITTED_TO_OZON',
        channelId: channel.id,
        taskId: imported.taskId,
        message: 'Ozon 已接收导入任务，正在等待平台处理回执。',
        evidence: {
          compilation: compilationEvidence,
          importResponse: imported.raw,
          importInfoReadError: this.errorMessage(error),
        },
      };
    }

    const importItem =
      importInfo.items.find((item) => item.offerId === payload.offerId) ??
      importInfo.items[0];
    if (importItem?.errors.length) {
      return {
        status: 'FAILED',
        code: 'OZON_IMPORT_ITEM_REJECTED',
        message: importItem.errors.map((error) => error.message).join('; '),
        channelId: channel.id,
        taskId: imported.taskId,
        evidence: {
          compilation: compilationEvidence,
          importResponse: imported.raw,
          importInfo: importInfo.raw,
        },
      };
    }
    if (!importItem?.productId) {
      return {
        status: 'SUBMITTED_TO_OZON',
        channelId: channel.id,
        taskId: imported.taskId,
        message: 'Ozon 已接收导入任务，商品 ID 尚未返回。',
        evidence: {
          compilation: compilationEvidence,
          importResponse: imported.raw,
          importInfo: importInfo.raw,
        },
      };
    }

    try {
      const infos = await session.getProductInfoList([
        { productId: importItem.productId, offerId: importItem.offerId },
      ]);
      const info = infos.find(
        (item) => item.productId === importItem.productId,
      );
      if (info && this.publishPolicy.isActiveExternalStatus(info.status)) {
        return {
          status: 'ACTIVE_ON_OZON',
          channelId: channel.id,
          taskId: imported.taskId,
          externalProductId: importItem.productId,
          externalStatus: info.status,
          message: 'Ozon 已确认商品处于可售状态。',
          evidence: {
            compilation: compilationEvidence,
            importResponse: imported.raw,
            importInfo: importInfo.raw,
          },
        };
      }
      return {
        status: 'SUBMITTED_TO_OZON',
        channelId: channel.id,
        taskId: imported.taskId,
        externalProductId: importItem.productId,
        externalStatus: info?.status,
        message: 'Ozon 已返回商品 ID，正在等待审核或可售状态回写。',
        evidence: {
          compilation: compilationEvidence,
          importResponse: imported.raw,
          importInfo: importInfo.raw,
        },
      };
    } catch (error) {
      return {
        status: 'SUBMITTED_TO_OZON',
        channelId: channel.id,
        taskId: imported.taskId,
        externalProductId: importItem.productId,
        message: 'Ozon 已接收导入任务，商品状态将在后续同步中确认。',
        evidence: {
          compilation: compilationEvidence,
          importResponse: imported.raw,
          importInfo: importInfo.raw,
          productReadError: this.errorMessage(error),
        },
      };
    }
  }

  private async findProduct(input: {
    organizationId: string;
    productId: string;
  }): Promise<(LocalProductRecord & { workspaceId: string }) | null> {
    return this.tenantDatabase.run(input.organizationId, (tx) =>
      tx.product.findFirst({
        where: {
          id: input.productId,
          workspace: { organizationId: input.organizationId },
        },
        select: {
          id: true,
          workspaceId: true,
          title: true,
          sku: true,
          price: true,
          currency: true,
          images: true,
          metadata: true,
          createdAt: true,
        },
      }),
    );
  }

  private findChannel(organizationId: string, workspaceId: string) {
    return this.tenantDatabase.run(organizationId, (tx) =>
      tx.channelConnection.findFirst({
        where: {
          workspaceId,
          provider: 'OZON',
          syncStatus: 'SUCCESS',
        },
        select: {
          id: true,
          accessTokenEncrypted: true,
        },
      }),
    );
  }

  private findChannelById(organizationId: string, channelId: string) {
    return this.tenantDatabase.run(organizationId, (tx) =>
      tx.channelConnection.findFirst({
        where: {
          id: channelId,
          provider: 'OZON',
          syncStatus: 'SUCCESS',
          workspace: { organizationId },
        },
        select: {
          id: true,
          accessTokenEncrypted: true,
        },
      }),
    );
  }

  private blockedByPolicy(
    channelId: string,
    policy: Extract<OzonPublishPolicyEvaluation, { decision: 'BLOCK' }>,
  ): OzonProductPublishResult {
    return {
      status: 'BLOCKED',
      code: policy.code,
      message: policy.message,
      channelId,
      evidence: { compilation: policy.evidence },
    };
  }

  private productNotFound(): OzonProductPublishResult {
    return {
      status: 'FAILED',
      code: 'PRODUCT_NOT_FOUND',
      message: '本地商品草稿不存在，或不属于当前组织。',
    };
  }

  private channelNotConnected(): OzonProductPublishResult {
    return {
      status: 'BLOCKED',
      code: 'OZON_CHANNEL_NOT_CONNECTED',
      message: '当前工作区没有已验证的 Ozon 店铺连接。',
    };
  }

  private failed(
    channelId: string,
    code: string,
    error: unknown,
    evidence?: Record<string, unknown>,
  ): OzonProductPublishResult {
    return {
      status: 'FAILED',
      code,
      channelId,
      message: this.errorMessage(error),
      ...(evidence ? { evidence } : {}),
    };
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

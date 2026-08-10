import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { OzonCredentialsService } from './ozon-credentials.service.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import {
  OzonSellerApiClient,
  type OzonProductRef,
  type OzonProductPriceUpdateResult,
  type OzonProductStockInfo,
  type OzonProductStockUpdateResult,
  type OzonRfbsReturnAction,
  type OzonRfbsReturnInfo,
} from './ozon-seller-api.client.js';
import { OzonPerformanceApiClient } from './ozon-performance-api.client.js';

type OzonExternalWriteStatus = 'executed' | 'external_execution_failed';

interface ApprovedNotificationContext {
  organizationId: string;
  userId: string;
  title: string;
}

interface ApprovedOzonAction {
  action: string;
  params: Record<string, unknown>;
}

interface ProductForWrite {
  id: string;
  organizationId: string;
  workspaceId: string;
  title: string;
  price: unknown;
  currency: string;
  metadata: unknown;
}

interface ChannelForWrite {
  id: string;
  workspaceId: string;
  provider: string;
  accessTokenEncrypted: string;
  syncStatus: string;
}

@Injectable()
export class OzonExternalWriteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ozonCredentials: OzonCredentialsService,
    private readonly ozonClient: OzonSellerApiClient,
    private readonly audit: AuditService,
    private readonly tenantDatabase: TenantDatabaseContextService,
    private readonly performanceClient: OzonPerformanceApiClient,
  ) {}

  async executeApprovedCustomerServiceAction(
    notification: ApprovedNotificationContext,
    action: ApprovedOzonAction,
  ) {
    const channelId = this.asOptionalString(action.params.channelId);
    const targetId = this.asOptionalString(action.params.targetId);
    const text = this.asOptionalString(action.params.text);
    if (!channelId || !targetId || !text) {
      return this.failure(action.action, 'invalid_request', {
        reason:
          'Ozon customer-service action requires channelId, targetId and text',
      });
    }
    const channel = await this.findChannelById(
      notification.organizationId,
      channelId,
      'OZON',
    );
    if (!channel) {
      return this.failure(action.action, 'channel_not_connected', {
        reason: 'Ozon Seller API channel was not found',
        channelId,
      });
    }

    await this.audit.appendStrict({
      organizationId: notification.organizationId,
      actorId: notification.userId,
      action: `ozon.customer-service.${action.action}.started`,
      resourceType: 'OzonCustomerTarget',
      resourceId: targetId,
      after: {
        provider: 'OZON',
        channelId,
        action: action.action,
        humanApproved: true,
      },
    });

    try {
      const credentials = await this.ozonCredentials.decode(
        channel.accessTokenEncrypted,
      );
      let response: Record<string, unknown>;
      if (action.action === 'ozon.chat.send_message') {
        response = await this.ozonClient.sendCustomerChatMessage(credentials, {
          chatId: targetId,
          text,
        });
      } else if (action.action === 'ozon.question.answer') {
        const sku = this.asNumber(action.params.sku);
        if (!sku || !Number.isInteger(sku)) {
          return this.failure(action.action, 'invalid_request', {
            reason: 'Ozon question answer requires a positive integer SKU',
          });
        }
        response = await this.ozonClient.answerCustomerQuestion(credentials, {
          questionId: targetId,
          sku,
          text,
        });
      } else if (action.action === 'ozon.review.comment') {
        response = await this.ozonClient.commentOnCustomerReview(credentials, {
          reviewId: targetId,
          text,
        });
      } else {
        return this.failure(action.action, 'unsupported_action', {
          reason: 'Unsupported Ozon customer-service action',
        });
      }

      const executedAt = new Date().toISOString();
      await this.audit.appendStrict({
        organizationId: notification.organizationId,
        actorId: notification.userId,
        action: `ozon.customer-service.${action.action}.completed`,
        resourceType: 'OzonCustomerTarget',
        resourceId: targetId,
        after: {
          provider: 'OZON',
          channelId,
          action: action.action,
          response,
          executedAt,
        },
      });
      return {
        status: 'executed' as const,
        action: action.action,
        externalExecution: {
          status: 'accepted_by_ozon',
          provider: 'OZON',
          channelId,
          targetId,
          response,
          executedAt,
        },
        guardrail:
          'The Ozon customer-service write was sent only after explicit notification-center approval.',
      };
    } catch (error) {
      return this.failure(action.action, 'adapter_error', {
        reason: error instanceof Error ? error.message : String(error),
        provider: 'OZON',
        channelId,
        targetId,
      });
    }
  }

  async executeApprovedAdsAction(
    notification: ApprovedNotificationContext,
    action: ApprovedOzonAction,
  ) {
    const channelId = this.asOptionalString(action.params.channelId);
    const campaignId = this.asOptionalString(action.params.campaignId);
    if (!channelId || !campaignId) {
      return this.failure(action.action, 'invalid_request', {
        reason: 'Ozon ads action requires channelId and campaignId',
      });
    }
    const channel = await this.findChannelById(
      notification.organizationId,
      channelId,
      'OZON_PERFORMANCE',
    );
    if (!channel) {
      return this.failure(action.action, 'channel_not_connected', {
        reason: 'Ozon Performance API channel was not found',
        channelId,
      });
    }

    await this.audit.appendStrict({
      organizationId: notification.organizationId,
      actorId: notification.userId,
      action: `ozon.performance.${action.action}.started`,
      resourceType: 'OzonCampaign',
      resourceId: campaignId,
      after: {
        provider: 'OZON_PERFORMANCE',
        channelId,
        action: action.action,
        humanApproved: true,
      },
    });

    try {
      const credentials = await this.ozonCredentials.decodePerformance(
        channel.accessTokenEncrypted,
      );
      let response: Record<string, unknown>;
      if (action.action === 'ozon.ads.activate') {
        response = await this.performanceClient.activateCampaign(
          credentials,
          campaignId,
        );
      } else if (action.action === 'ozon.ads.deactivate') {
        response = await this.performanceClient.deactivateCampaign(
          credentials,
          campaignId,
        );
      } else if (action.action === 'ozon.ads.weekly_budget.update') {
        const weeklyBudgetRub = this.asNumber(action.params.weeklyBudgetRub);
        if (weeklyBudgetRub === undefined || weeklyBudgetRub < 0) {
          return this.failure(action.action, 'invalid_request', {
            reason:
              'Ozon weekly budget update requires a non-negative RUB amount',
          });
        }
        response = await this.performanceClient.updateCampaignBudget(
          credentials,
          campaignId,
          weeklyBudgetRub,
        );
      } else {
        return this.failure(action.action, 'unsupported_action', {
          reason: 'Unsupported Ozon Performance action',
        });
      }
      const executedAt = new Date().toISOString();
      await this.audit.appendStrict({
        organizationId: notification.organizationId,
        actorId: notification.userId,
        action: `ozon.performance.${action.action}.completed`,
        resourceType: 'OzonCampaign',
        resourceId: campaignId,
        after: {
          provider: 'OZON_PERFORMANCE',
          channelId,
          action: action.action,
          response,
          executedAt,
        },
      });
      return {
        status: 'executed' as const,
        action: action.action,
        externalExecution: {
          status: 'accepted_by_ozon',
          provider: 'OZON_PERFORMANCE',
          channelId,
          campaignId,
          response,
          executedAt,
        },
        guardrail:
          'The Ozon advertising mutation was sent only after explicit notification-center approval.',
      };
    } catch (error) {
      return this.failure(action.action, 'adapter_error', {
        reason: error instanceof Error ? error.message : String(error),
        provider: 'OZON_PERFORMANCE',
        channelId,
        campaignId,
      });
    }
  }

  async executeApprovedOrderRefund(
    notification: ApprovedNotificationContext,
    action: ApprovedOzonAction,
  ) {
    if (action.action !== 'ozon.order.refund') {
      return this.failure(action.action, 'unsupported_action', {
        reason:
          'Only ozon.order.refund is wired to the guarded Ozon rFBS adapter',
      });
    }

    const channelId = this.asOptionalString(action.params.channelId);
    const returnId = this.asNumber(
      action.params.returnId ?? action.params.return_id,
    );
    const refundScope = this.asOptionalString(action.params.refundScope);
    const confirmFullRefund = action.params.confirmFullRefund === true;
    const returnForBackWay =
      this.asNumber(
        action.params.returnForBackWay ?? action.params.return_for_back_way,
      ) ?? 0;

    if (
      !channelId ||
      !returnId ||
      !Number.isInteger(returnId) ||
      returnId <= 0 ||
      refundScope !== 'rfbs_full_return' ||
      !confirmFullRefund ||
      returnForBackWay < 0
    ) {
      return this.failure(action.action, 'invalid_request', {
        reason:
          'Ozon refund requires channelId, a positive rFBS returnId, refundScope=rfbs_full_return, confirmFullRefund=true and a non-negative returnForBackWay amount',
      });
    }

    const channel = await this.findChannelById(
      notification.organizationId,
      channelId,
      'OZON',
    );
    if (!channel) {
      return this.failure(action.action, 'channel_not_connected', {
        reason: 'Ozon Seller API channel was not found',
        channelId,
        returnId,
      });
    }

    const credentials = await this.ozonCredentials.decode(
      channel.accessTokenEncrypted,
    );
    let before: OzonRfbsReturnInfo;
    try {
      before = await this.ozonClient.getRfbsReturn(credentials, returnId);
    } catch (error) {
      return this.failure(action.action, 'return_read_failed', {
        reason: error instanceof Error ? error.message : String(error),
        provider: 'OZON',
        channelId,
        returnId,
      });
    }

    if (this.isRfbsMoneyReturned(before)) {
      await this.audit.appendStrict({
        organizationId: notification.organizationId,
        actorId: notification.userId,
        action: 'ozon.external-write.order-refund.idempotent',
        resourceType: 'OzonRfbsReturn',
        resourceId: String(returnId),
        after: {
          provider: 'OZON',
          channelId,
          returnId,
          state: before.state,
          humanApproved: true,
          externalMutation: false,
        },
      });
      return {
        status: 'executed' as const,
        action: action.action,
        externalExecution: {
          status: 'already_refunded',
          provider: 'OZON',
          channelId,
          returnId,
          state: before.state,
          mutationPerformed: false,
        },
        guardrail:
          'Ozon readback showed that this rFBS return was already refunded, so no duplicate mutation was sent.',
      };
    }

    const refundAction = this.resolveRfbsRefundAction(
      before,
      this.asNumber(action.params.returnActionId),
    );
    if (!refundAction) {
      return this.failure(action.action, 'refund_action_not_available', {
        reason:
          'Ozon did not expose an unambiguous full-refund action for this rFBS return',
        provider: 'OZON',
        channelId,
        returnId,
        availableActions: before.availableActions,
        state: before.state,
      });
    }

    await this.audit.appendStrict({
      organizationId: notification.organizationId,
      actorId: notification.userId,
      action: 'ozon.external-write.order-refund.started',
      resourceType: 'OzonRfbsReturn',
      resourceId: String(returnId),
      before: {
        provider: 'OZON',
        channelId,
        returnId,
        returnNumber: before.returnNumber,
        postingNumber: before.postingNumber,
        state: before.state,
        availableActions: before.availableActions,
      },
      after: {
        canonicalAction: action.action,
        selectedAction: refundAction,
        refundScope,
        returnForBackWay,
        humanApproved: true,
        externalMutation: 'not_started_until_audit_persisted',
      },
    });

    try {
      await this.ozonClient.setRfbsReturnAction(credentials, {
        returnId,
        actionId: refundAction.id,
        returnForBackWay,
      });
      const after = await this.ozonClient.getRfbsReturn(credentials, returnId);
      const refundVerified = this.isRfbsMoneyReturned(after);
      const actionRemoved = !after.availableActions.some(
        (candidate) => candidate.id === refundAction.id,
      );

      if (!refundVerified && !actionRemoved) {
        await this.audit.appendStrict({
          organizationId: notification.organizationId,
          actorId: notification.userId,
          action: 'ozon.external-write.order-refund.verification-failed',
          resourceType: 'OzonRfbsReturn',
          resourceId: String(returnId),
          before: { state: before.state, selectedAction: refundAction },
          after: {
            provider: 'OZON',
            channelId,
            state: after.state,
            availableActions: after.availableActions,
            mutationAccepted: true,
          },
        });
        return this.failure(action.action, 'readback_mismatch', {
          reason:
            'Ozon accepted the refund action request, but return readback did not show a state or available-action transition',
          provider: 'OZON',
          channelId,
          returnId,
          mutationAccepted: true,
          stateBefore: before.state,
          stateAfter: after.state,
        });
      }

      const executedAt = new Date().toISOString();
      const verificationStatus = refundVerified
        ? 'refund_verified'
        : 'refund_submitted_verified';
      await this.audit.appendStrict({
        organizationId: notification.organizationId,
        actorId: notification.userId,
        action: 'ozon.external-write.order-refund.completed',
        resourceType: 'OzonRfbsReturn',
        resourceId: String(returnId),
        before: { state: before.state, selectedAction: refundAction },
        after: {
          provider: 'OZON',
          channelId,
          state: after.state,
          availableActions: after.availableActions,
          verificationStatus,
          executedAt,
        },
      });
      return {
        status: 'executed' as const,
        action: action.action,
        externalExecution: {
          status: verificationStatus,
          provider: 'OZON',
          channelId,
          returnId,
          returnNumber: after.returnNumber ?? before.returnNumber,
          postingNumber: after.postingNumber ?? before.postingNumber,
          selectedAction: refundAction,
          state: after.state,
          refundVerified,
          executedAt,
        },
        guardrail: refundVerified
          ? 'The full rFBS refund was sent only after human approval and Ozon readback confirmed the money-return state.'
          : 'The full rFBS refund was sent only after human approval; Ozon readback confirmed the action transition, while final money settlement remains visible as platform state.',
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.audit.appendStrict({
        organizationId: notification.organizationId,
        actorId: notification.userId,
        action: 'ozon.external-write.order-refund.failed',
        resourceType: 'OzonRfbsReturn',
        resourceId: String(returnId),
        before: { state: before.state, selectedAction: refundAction },
        after: { provider: 'OZON', channelId, reason },
      });
      return this.failure(action.action, 'adapter_error', {
        reason,
        provider: 'OZON',
        channelId,
        returnId,
      });
    }
  }

  async executeApprovedPriceUpdate(
    notification: ApprovedNotificationContext,
    action: ApprovedOzonAction,
  ) {
    const startedAt = new Date().toISOString();
    const requestedPrice = this.asNumber(action.params.price);
    if (action.action !== 'ozon.price.update') {
      return this.failure(action.action, 'unsupported_action', {
        reason:
          'Only ozon.price.update and ozon.stock.update are wired to the guarded Ozon adapter',
        startedAt,
      });
    }
    if (requestedPrice === undefined || requestedPrice <= 0) {
      return this.failure(action.action, 'invalid_request', {
        reason: 'A positive price is required before writing to Ozon',
        startedAt,
      });
    }

    const localProductId = this.asOptionalString(action.params.productId);
    if (!localProductId) {
      return this.failure(action.action, 'invalid_request', {
        reason: 'Local productId is required before writing to Ozon',
        startedAt,
      });
    }

    const product = await this.findProduct(
      notification.organizationId,
      localProductId,
    );
    if (!product) {
      return this.failure(action.action, 'product_not_found', {
        reason: 'The approved Ozon product no longer exists in this org',
        productId: localProductId,
        startedAt,
      });
    }

    const metadata = this.asRecord(product.metadata);
    if (metadata.source !== 'ozon') {
      return this.failure(action.action, 'not_ozon_product', {
        reason: 'Only products synced from Ozon can be written back to Ozon',
        productId: product.id,
        startedAt,
      });
    }

    const ref = this.resolveOzonRef(action.params, metadata);
    if (!ref.productId && !ref.offerId) {
      await this.markProductFailure(product, metadata, action.action, {
        status: 'invalid_request',
        reason: 'Ozon product_id or offer_id is missing',
        startedAt,
      });
      return this.failure(action.action, 'invalid_request', {
        reason: 'Ozon product_id or offer_id is missing',
        productId: product.id,
        startedAt,
      });
    }

    const channel = await this.findOzonChannel(
      notification.organizationId,
      product,
      metadata,
    );
    if (!channel) {
      await this.markProductFailure(product, metadata, action.action, {
        status: 'channel_not_connected',
        reason: 'No connected Ozon channel was found for this product',
        startedAt,
      });
      return this.failure(action.action, 'channel_not_connected', {
        reason: 'No connected Ozon channel was found for this product',
        productId: product.id,
        startedAt,
      });
    }

    const currencyCode =
      this.asOptionalString(action.params.currency) ??
      product.currency ??
      this.asOptionalString(metadata.currencyCode) ??
      'RUB';

    await this.audit.appendStrict({
      organizationId: notification.organizationId,
      actorId: notification.userId,
      action: 'ozon.external-write.price.started',
      resourceType: 'Product',
      resourceId: product.id,
      after: {
        provider: 'OZON',
        channelId: channel.id,
        action: action.action,
        requestedPrice,
        currencyCode,
        productId: ref.productId,
        offerId: ref.offerId,
        humanApproved: true,
        externalMutation: 'not_started_until_audit_persisted',
      },
    });

    try {
      const credentials = await this.ozonCredentials.decode(
        channel.accessTokenEncrypted,
      );
      const writeResult = await this.ozonClient.updateProductPrices(
        credentials,
        [
          {
            ...ref,
            price: requestedPrice,
            currencyCode,
          },
        ],
      );
      const writeFailure = this.resolveWriteFailure(writeResult, ref);
      if (writeFailure) {
        await this.markProductFailure(product, metadata, action.action, {
          status: 'write_rejected',
          reason: writeFailure,
          channelId: channel.id,
          requestedPrice,
          currencyCode,
          startedAt,
        });
        return this.failure(action.action, 'write_rejected', {
          reason: writeFailure,
          provider: 'OZON',
          channelId: channel.id,
          productId: product.id,
          requestedPrice,
          currencyCode,
          startedAt,
        });
      }

      const infos = await this.ozonClient.getProductInfoList(credentials, [
        ref,
      ]);
      const readback = this.findReadbackInfo(infos, ref);
      const readbackPrice = this.asNumber(readback?.price);
      if (
        readbackPrice === undefined ||
        !this.sameMoney(readbackPrice, requestedPrice)
      ) {
        await this.markProductFailure(product, metadata, action.action, {
          status: 'readback_mismatch',
          reason: 'Ozon accepted the write, but readback price did not match',
          channelId: channel.id,
          requestedPrice,
          actualPrice: readbackPrice,
          currencyCode,
          startedAt,
        });
        return this.failure(action.action, 'readback_mismatch', {
          reason: 'Ozon accepted the write, but readback price did not match',
          provider: 'OZON',
          channelId: channel.id,
          productId: product.id,
          expectedPrice: requestedPrice,
          actualPrice: readbackPrice,
          currencyCode,
          startedAt,
        });
      }

      const executedAt = new Date().toISOString();
      await this.tenantDatabase.run(product.organizationId, (tx) =>
        tx.product.update({
          where: { id: product.id },
          data: {
            price: requestedPrice,
            currency: currencyCode,
            metadata: {
              ...metadata,
              pendingExternalSync: false,
              externalStoreMutation: 'executed',
              latestChangeOrder: {
                ...this.asRecord(metadata.latestChangeOrder),
                action: action.action,
                status: 'executed',
                executedAt,
                requestedValue: requestedPrice,
              },
              lastExternalWrite: {
                provider: 'OZON',
                action: action.action,
                status: 'verified',
                channelId: channel.id,
                productId: ref.productId,
                offerId: ref.offerId,
                requestedPrice,
                readbackPrice,
                currencyCode,
                notificationTitle: notification.title,
                executedBy: notification.userId,
                executedAt,
              },
            },
          },
        }),
      );

      return {
        status: 'executed' as OzonExternalWriteStatus,
        action: action.action,
        externalExecution: {
          status: 'verified',
          provider: 'OZON',
          channelId: channel.id,
          productId: product.id,
          ozonProductId: ref.productId,
          offerId: ref.offerId,
          requestedPrice,
          readbackPrice,
          currencyCode,
          executedAt,
        },
        guardrail:
          'Ozon price writes are marked executed only after the external API accepts the change and readback matches.',
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.markProductFailure(product, metadata, action.action, {
        status: 'adapter_error',
        reason,
        requestedPrice,
        currencyCode,
        startedAt,
      });
      return this.failure(action.action, 'adapter_error', {
        reason,
        provider: 'OZON',
        productId: product.id,
        requestedPrice,
        currencyCode,
        startedAt,
      });
    }
  }

  async executeApprovedStockUpdate(
    notification: ApprovedNotificationContext,
    action: ApprovedOzonAction,
  ) {
    const startedAt = new Date().toISOString();
    const requestedStock = this.asNumber(action.params.stock);
    if (action.action !== 'ozon.stock.update') {
      return this.failure(action.action, 'unsupported_action', {
        reason:
          'Only ozon.price.update and ozon.stock.update are wired to the guarded Ozon adapter',
        startedAt,
      });
    }
    if (
      requestedStock === undefined ||
      !Number.isInteger(requestedStock) ||
      requestedStock < 0
    ) {
      return this.failure(action.action, 'invalid_request', {
        reason:
          'A non-negative integer stock is required before writing to Ozon',
        startedAt,
      });
    }

    const localProductId = this.asOptionalString(action.params.productId);
    if (!localProductId) {
      return this.failure(action.action, 'invalid_request', {
        reason: 'Local productId is required before writing to Ozon',
        startedAt,
      });
    }

    const product = await this.findProduct(
      notification.organizationId,
      localProductId,
    );
    if (!product) {
      return this.failure(action.action, 'product_not_found', {
        reason: 'The approved Ozon product no longer exists in this org',
        productId: localProductId,
        startedAt,
      });
    }

    const metadata = this.asRecord(product.metadata);
    if (metadata.source !== 'ozon') {
      return this.failure(action.action, 'not_ozon_product', {
        reason: 'Only products synced from Ozon can be written back to Ozon',
        productId: product.id,
        startedAt,
      });
    }

    const ref = this.resolveOzonRef(action.params, metadata);
    if (!ref.productId && !ref.offerId) {
      await this.markProductFailure(product, metadata, action.action, {
        status: 'invalid_request',
        reason: 'Ozon product_id or offer_id is missing',
        startedAt,
      });
      return this.failure(action.action, 'invalid_request', {
        reason: 'Ozon product_id or offer_id is missing',
        productId: product.id,
        startedAt,
      });
    }

    const warehouseId = this.resolveWarehouseId(action.params, metadata);
    if (!warehouseId) {
      await this.markProductFailure(product, metadata, action.action, {
        status: 'invalid_request',
        reason: 'Ozon warehouse_id is required for stock writes',
        startedAt,
      });
      return this.failure(action.action, 'invalid_request', {
        reason: 'Ozon warehouse_id is required for stock writes',
        productId: product.id,
        startedAt,
      });
    }

    const channel = await this.findOzonChannel(
      notification.organizationId,
      product,
      metadata,
    );
    if (!channel) {
      await this.markProductFailure(product, metadata, action.action, {
        status: 'channel_not_connected',
        reason: 'No connected Ozon channel was found for this product',
        startedAt,
      });
      return this.failure(action.action, 'channel_not_connected', {
        reason: 'No connected Ozon channel was found for this product',
        productId: product.id,
        startedAt,
      });
    }

    await this.audit.appendStrict({
      organizationId: notification.organizationId,
      actorId: notification.userId,
      action: 'ozon.external-write.stock.started',
      resourceType: 'Product',
      resourceId: product.id,
      after: {
        provider: 'OZON',
        channelId: channel.id,
        action: action.action,
        requestedStock,
        warehouseId,
        productId: ref.productId,
        offerId: ref.offerId,
        humanApproved: true,
        externalMutation: 'not_started_until_audit_persisted',
      },
    });

    try {
      const credentials = await this.ozonCredentials.decode(
        channel.accessTokenEncrypted,
      );
      const writeResult = await this.ozonClient.updateProductStocks(
        credentials,
        [
          {
            ...ref,
            warehouseId,
            stock: requestedStock,
          },
        ],
      );
      const writeFailure = this.resolveStockWriteFailure(
        writeResult,
        ref,
        warehouseId,
      );
      if (writeFailure) {
        await this.markProductFailure(product, metadata, action.action, {
          status: 'write_rejected',
          reason: writeFailure,
          channelId: channel.id,
          requestedStock,
          warehouseId,
          startedAt,
        });
        return this.failure(action.action, 'write_rejected', {
          reason: writeFailure,
          provider: 'OZON',
          channelId: channel.id,
          productId: product.id,
          requestedStock,
          warehouseId,
          startedAt,
        });
      }

      const stocks = await this.ozonClient.getProductStocks(credentials, [ref]);
      const readback = this.findReadbackStock(stocks, ref, warehouseId);
      const readbackStock = readback?.stock;
      if (readbackStock === undefined || readbackStock !== requestedStock) {
        await this.markProductFailure(product, metadata, action.action, {
          status: 'readback_mismatch',
          reason: 'Ozon accepted the write, but readback stock did not match',
          channelId: channel.id,
          requestedStock,
          actualStock: readbackStock,
          warehouseId,
          startedAt,
        });
        return this.failure(action.action, 'readback_mismatch', {
          reason: 'Ozon accepted the write, but readback stock did not match',
          provider: 'OZON',
          channelId: channel.id,
          productId: product.id,
          expectedStock: requestedStock,
          actualStock: readbackStock,
          warehouseId,
          startedAt,
        });
      }

      const executedAt = new Date().toISOString();
      await this.tenantDatabase.run(product.organizationId, (tx) =>
        tx.product.update({
          where: { id: product.id },
          data: {
            metadata: {
              ...metadata,
              stock: requestedStock,
              warehouseId,
              pendingExternalSync: false,
              externalStoreMutation: 'executed',
              latestChangeOrder: {
                ...this.asRecord(metadata.latestChangeOrder),
                action: action.action,
                status: 'executed',
                executedAt,
                requestedValue: requestedStock,
              },
              lastExternalWrite: {
                provider: 'OZON',
                action: action.action,
                status: 'verified',
                channelId: channel.id,
                productId: ref.productId,
                offerId: ref.offerId,
                warehouseId,
                requestedStock,
                readbackStock,
                notificationTitle: notification.title,
                executedBy: notification.userId,
                executedAt,
              },
            },
          },
        }),
      );

      return {
        status: 'executed' as OzonExternalWriteStatus,
        action: action.action,
        externalExecution: {
          status: 'verified',
          provider: 'OZON',
          channelId: channel.id,
          productId: product.id,
          ozonProductId: ref.productId,
          offerId: ref.offerId,
          warehouseId,
          requestedStock,
          readbackStock,
          executedAt,
        },
        guardrail:
          'Ozon stock writes are marked executed only after the external API accepts the change and readback matches.',
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.markProductFailure(product, metadata, action.action, {
        status: 'adapter_error',
        reason,
        requestedStock,
        warehouseId,
        startedAt,
      });
      return this.failure(action.action, 'adapter_error', {
        reason,
        provider: 'OZON',
        productId: product.id,
        requestedStock,
        warehouseId,
        startedAt,
      });
    }
  }

  private async findProduct(
    organizationId: string,
    productId: string,
  ): Promise<ProductForWrite | null> {
    const product = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.product.findFirst({
        where: {
          id: productId,
          workspace: { organizationId },
        },
      }),
    );
    return product ? { ...product, organizationId } : null;
  }

  private async findOzonChannel(
    organizationId: string,
    product: ProductForWrite,
    metadata: Record<string, unknown>,
  ): Promise<ChannelForWrite | null> {
    const channelId = this.asOptionalString(metadata.channelId);
    return this.tenantDatabase.run(organizationId, (tx) =>
      tx.channelConnection.findFirst({
        where: {
          workspaceId: product.workspaceId,
          provider: 'OZON',
          syncStatus: 'SUCCESS',
          ...(channelId ? { id: channelId } : {}),
        },
      }),
    );
  }

  private async findChannelById(
    organizationId: string,
    channelId: string,
    provider: 'OZON' | 'OZON_PERFORMANCE',
  ): Promise<ChannelForWrite | null> {
    return this.tenantDatabase.run(organizationId, (tx) =>
      tx.channelConnection.findFirst({
        where: {
          id: channelId,
          provider,
          syncStatus: 'SUCCESS',
          workspace: { organizationId },
        },
      }),
    );
  }

  private resolveOzonRef(
    params: Record<string, unknown>,
    metadata: Record<string, unknown>,
  ): OzonProductRef {
    return {
      productId: this.asNumber(params.ozonProductId ?? metadata.productId),
      offerId:
        this.asOptionalString(params.offerId) ??
        this.asOptionalString(metadata.offerId),
    };
  }

  private resolveWarehouseId(
    params: Record<string, unknown>,
    metadata: Record<string, unknown>,
  ): number | undefined {
    const warehouseId = this.asNumber(
      params.warehouseId ??
        params.ozonWarehouseId ??
        params.warehouse_id ??
        metadata.warehouseId ??
        metadata.ozonWarehouseId ??
        metadata.warehouse_id,
    );
    return warehouseId && Number.isInteger(warehouseId) && warehouseId > 0
      ? warehouseId
      : undefined;
  }

  private resolveWriteFailure(
    result: OzonProductPriceUpdateResult,
    ref: OzonProductRef,
  ): string | null {
    if (result.failures.length > 0) {
      return result.failures.map((failure) => failure.message).join('; ');
    }
    const matchingItem = result.items.find((item) => this.sameRef(item, ref));
    if (!matchingItem) {
      return 'Ozon did not return a confirmation row for this product';
    }
    if (!matchingItem.updated) {
      return 'Ozon returned updated=false for this product';
    }
    return null;
  }

  private resolveStockWriteFailure(
    result: OzonProductStockUpdateResult,
    ref: OzonProductRef,
    warehouseId: number,
  ): string | null {
    if (result.failures.length > 0) {
      return result.failures.map((failure) => failure.message).join('; ');
    }
    const matchingItem = result.items.find(
      (item) =>
        this.sameRef(item, ref) &&
        (!item.warehouseId || item.warehouseId === warehouseId),
    );
    if (!matchingItem) {
      return 'Ozon did not return a confirmation row for this product stock';
    }
    if (!matchingItem.updated) {
      return 'Ozon returned updated=false for this product stock';
    }
    return null;
  }

  private findReadbackInfo(
    items: Array<{ productId?: number; offerId?: string; price?: string }>,
    ref: OzonProductRef,
  ) {
    return items.find((item) => this.sameRef(item, ref)) ?? items[0];
  }

  private findReadbackStock(
    items: OzonProductStockInfo[],
    ref: OzonProductRef,
    warehouseId: number,
  ) {
    return (
      items.find(
        (item) => this.sameRef(item, ref) && item.warehouseId === warehouseId,
      ) ??
      items.find(
        (item) => this.sameRef(item, ref) && item.warehouseId === undefined,
      ) ??
      items[0]
    );
  }

  private sameRef(
    item: { productId?: number; offerId?: string },
    ref: OzonProductRef,
  ): boolean {
    if (ref.productId && item.productId === ref.productId) {
      return true;
    }
    return Boolean(ref.offerId && item.offerId === ref.offerId);
  }

  private resolveRfbsRefundAction(
    info: OzonRfbsReturnInfo,
    requestedActionId?: number,
  ): OzonRfbsReturnAction | null {
    const candidates = info.availableActions.filter((action) =>
      this.isRfbsRefundActionName(action.name),
    );
    if (requestedActionId !== undefined) {
      return (
        candidates.find((action) => action.id === requestedActionId) ?? null
      );
    }
    return candidates.length === 1 ? candidates[0] : null;
  }

  private isRfbsRefundActionName(name: string): boolean {
    const normalized = name
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '_');
    return (
      normalized.includes('return_money') ||
      normalized.includes('money_return') ||
      normalized.includes('full_refund') ||
      normalized.includes('refund_money') ||
      (normalized.includes('верн') && normalized.includes('деньг')) ||
      normalized.includes('возврат_денег')
    );
  }

  private isRfbsMoneyReturned(info: OzonRfbsReturnInfo): boolean {
    const normalized = [
      info.state.state,
      info.state.stateName,
      info.state.moneyReturnStateName,
    ]
      .filter((value): value is string => Boolean(value))
      .join(' ')
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '_');
    return (
      normalized.includes('money_returned') ||
      normalized.includes('refund_completed') ||
      normalized.includes('refunded') ||
      normalized.includes('деньги_возвращены') ||
      normalized.includes('возврат_денег_заверш')
    );
  }

  private async markProductFailure(
    product: ProductForWrite,
    metadata: Record<string, unknown>,
    action: string,
    failure: Record<string, unknown> & { status: string; reason: string },
  ): Promise<void> {
    const failedAt = new Date().toISOString();
    const { status: failureStatus, ...failureDetails } = failure;
    await this.tenantDatabase.run(product.organizationId, (tx) =>
      tx.product.update({
        where: { id: product.id },
        data: {
          metadata: {
            ...metadata,
            pendingExternalSync: true,
            externalStoreMutation:
              failure.status === 'readback_mismatch'
                ? 'verification_failed'
                : 'write_failed',
            latestChangeOrder: {
              ...this.asRecord(metadata.latestChangeOrder),
              action,
              status: 'failed',
              failedAt,
              failureReason: failure.reason,
            },
            lastExternalWrite: {
              provider: 'OZON',
              action,
              status: 'failed',
              failureStatus,
              ...failureDetails,
              failedAt,
            },
          },
        },
      }),
    );
  }

  private failure(
    action: string,
    status: string,
    details: Record<string, unknown>,
  ) {
    return {
      status: 'external_execution_failed' as OzonExternalWriteStatus,
      action,
      externalExecution: {
        status,
        ...details,
      },
      guardrail:
        'The notification is not marked executed unless the Ozon write is accepted and readback verifies the requested change.',
    };
  }

  private sameMoney(left: number, right: number): boolean {
    return Math.round(left * 100) === Math.round(right * 100);
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private asOptionalString(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return undefined;
  }

  private asNumber(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : undefined;
  }
}

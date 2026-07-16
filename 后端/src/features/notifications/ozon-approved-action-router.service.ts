import { Injectable } from '@nestjs/common';
import { OzonExternalWriteService } from '../channels/ozon-external-write.service.js';

interface ApprovedNotificationContext {
  organizationId: string;
  userId: string;
  title: string;
}

interface ApprovedAction {
  action: string;
  params: Record<string, unknown>;
}

export interface ApprovedActionExecutionContext {
  proposalId: string;
  approvalDecisionId: string;
  action: string;
  capabilityScope: string;
  payloadHash: string;
  idempotencyKey: string;
}

const ROUTED_ACTIONS = new Set([
  'price.adjust',
  'ads.campaign.update',
  'ozon.price.update',
  'ozon.stock.update',
  'order.refund',
  'ozon.order.refund',
  'ozon.ads.update',
  'ozon.chat.send_message',
  'ozon.question.answer',
  'ozon.review.comment',
  'ozon.ads.activate',
  'ozon.ads.deactivate',
  'ozon.ads.weekly_budget.update',
]);

const GENERIC_ACTIONS = new Set([
  'price.adjust',
  'ads.campaign.update',
  'order.refund',
]);

@Injectable()
export class OzonApprovedActionRouterService {
  constructor(private readonly externalWrite: OzonExternalWriteService) {}

  supports(actionName: string): boolean {
    return ROUTED_ACTIONS.has(actionName);
  }

  async execute(
    notification: ApprovedNotificationContext,
    requestedAction: ApprovedAction,
    metadata: Record<string, unknown>,
    execution: ApprovedActionExecutionContext,
  ): Promise<unknown> {
    if (
      execution.action !== requestedAction.action ||
      execution.capabilityScope !== `action:${requestedAction.action}`
    ) {
      return this.failure(requestedAction.action, 'capability_scope_mismatch', {
        reason:
          'The consumed approval grant does not authorize this exact action.',
        proposalId: execution.proposalId,
        approvalDecisionId: execution.approvalDecisionId,
      });
    }
    if (!this.supports(requestedAction.action)) {
      return this.failure(requestedAction.action, 'action_not_supported', {
        reason:
          'This action is not executable by the Ozon write router. Product publication must use the ProductLaunch immutable snapshot workflow.',
      });
    }
    const normalized = this.normalize(requestedAction, metadata);
    if ('failure' in normalized) {
      return normalized.failure;
    }

    const action = normalized.action;
    if (action.action === 'ozon.price.update') {
      return this.externalWrite.executeApprovedPriceUpdate(
        notification,
        action,
      );
    }
    if (action.action === 'ozon.stock.update') {
      return this.externalWrite.executeApprovedStockUpdate(
        notification,
        action,
      );
    }
    if (action.action === 'ozon.order.refund') {
      return this.externalWrite.executeApprovedOrderRefund(
        notification,
        action,
      );
    }
    if (
      action.action === 'ozon.chat.send_message' ||
      action.action === 'ozon.question.answer' ||
      action.action === 'ozon.review.comment'
    ) {
      return this.externalWrite.executeApprovedCustomerServiceAction(
        notification,
        action,
      );
    }
    return this.externalWrite.executeApprovedAdsAction(notification, action);
  }

  private normalize(
    requestedAction: ApprovedAction,
    metadata: Record<string, unknown>,
  ): { action: ApprovedAction } | { failure: unknown } {
    const provider = this.provider(requestedAction.params, metadata);
    if (GENERIC_ACTIONS.has(requestedAction.action) && !provider) {
      return {
        failure: this.failure(requestedAction.action, 'invalid_request', {
          reason:
            'Generic external write requires an explicit provider/platform; use OZON or an ozon.* action.',
        }),
      };
    }

    if (
      GENERIC_ACTIONS.has(requestedAction.action) &&
      provider !== 'OZON' &&
      provider !== 'OZON_PERFORMANCE'
    ) {
      return {
        failure: this.failure(
          requestedAction.action,
          'provider_not_supported',
          {
            reason: `Provider ${provider} is not supported by the Ozon approved-action router.`,
            provider,
          },
        ),
      };
    }

    let actionName = requestedAction.action;
    switch (requestedAction.action) {
      case 'price.adjust':
        actionName = 'ozon.price.update';
        break;
      case 'order.refund':
        actionName = 'ozon.order.refund';
        break;
      case 'ads.campaign.update':
      case 'ozon.ads.update': {
        const adsAction = this.resolveAdsAction(requestedAction.params);
        if (!adsAction) {
          return {
            failure: this.failure(requestedAction.action, 'invalid_request', {
              reason:
                'Ozon ads update requires operation=activate|deactivate|weekly_budget_update, enabled, or weeklyBudgetRub.',
            }),
          };
        }
        actionName = adsAction;
        break;
      }
    }

    return {
      action: {
        action: actionName,
        params: requestedAction.params,
      },
    };
  }

  private resolveAdsAction(params: Record<string, unknown>): string | null {
    const operation = this.asOptionalString(params.operation)?.toLowerCase();
    if (operation === 'activate') return 'ozon.ads.activate';
    if (operation === 'deactivate') return 'ozon.ads.deactivate';
    if (
      operation === 'weekly_budget_update' ||
      operation === 'update_budget' ||
      operation === 'budget'
    ) {
      return 'ozon.ads.weekly_budget.update';
    }
    if (typeof params.enabled === 'boolean') {
      return params.enabled ? 'ozon.ads.activate' : 'ozon.ads.deactivate';
    }
    if (params.weeklyBudgetRub !== undefined) {
      return 'ozon.ads.weekly_budget.update';
    }
    return null;
  }

  private provider(
    params: Record<string, unknown>,
    metadata: Record<string, unknown>,
  ): string | undefined {
    const value =
      this.asOptionalString(params.provider) ??
      this.asOptionalString(params.platform) ??
      this.asOptionalString(metadata.provider) ??
      this.asOptionalString(metadata.platform);
    return value
      ?.trim()
      .toUpperCase()
      .replace(/[-\s]+/g, '_');
  }

  private failure(
    actionName: string,
    status: string,
    details: Record<string, unknown>,
  ) {
    return {
      status: 'external_execution_failed' as const,
      action: actionName,
      externalExecution: { status, ...details },
      guardrail:
        'The approved action was not marked executed because a required validation, audit, adapter, or platform confirmation failed.',
    };
  }

  private asOptionalString(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value))
      return String(value);
    return undefined;
  }
}

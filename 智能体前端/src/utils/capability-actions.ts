import type { AgentRoadmapStatus } from '../api/agentRoadmap';

export type CapabilityAction =
  | {
      kind: 'NAVIGATE';
      path: string;
      messageKey: string;
      actionLabelKey: string;
    }
  | {
      kind: 'DIALOG';
      messageKey: string;
      actionLabelKey: string;
      dialogTitleKey: string;
      dialogBodyKey: string;
    };

export function capabilityActionForBlocker(blocker: string): CapabilityAction {
  const normalized = blocker.toLocaleLowerCase('zh-CN');
  if (/premium|订阅|套餐/u.test(normalized)) {
    return {
      kind: 'DIALOG',
      messageKey: 'capabilityCenter.warnings.subscription',
      actionLabelKey: 'capabilityCenter.actions.viewInstructions',
      dialogTitleKey: 'capabilityCenter.dialogs.subscriptionTitle',
      dialogBodyKey: 'capabilityCenter.dialogs.subscriptionBody',
    };
  }
  if (/client[_ -]?id|client[_ -]?secret|api[_ -]?key|凭证|密钥/u.test(normalized)) {
    return {
      kind: 'NAVIGATE',
      path: '/store-monitor',
      messageKey: 'capabilityCenter.warnings.credentials',
      actionLabelKey: 'capabilityCenter.actions.configureCredentials',
    };
  }
  if (/通道|webhook|队列|回调|供应商|provider/u.test(normalized)) {
    return {
      kind: 'NAVIGATE',
      path: '/enterprise-readiness?section=channels',
      messageKey: 'capabilityCenter.warnings.channel',
      actionLabelKey: 'capabilityCenter.actions.viewSystemStatus',
    };
  }
  return {
    kind: 'NAVIGATE',
    path: '/enterprise-readiness',
    messageKey: 'capabilityCenter.warnings.dependency',
    actionLabelKey: 'capabilityCenter.actions.viewDependency',
  };
}

export function capabilityStatusKey(status: AgentRoadmapStatus): string {
  return {
    passed: 'capabilityCenter.status.available',
    partial: 'capabilityCenter.status.needsConfiguration',
    backend: 'capabilityCenter.status.dependencyFailure',
    missing: 'capabilityCenter.status.notConnected',
  }[status];
}

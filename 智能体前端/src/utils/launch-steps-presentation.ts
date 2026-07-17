import { customerErrorPresentation } from './customer-facing-language.ts';

export type LaunchStepId = 'economics' | 'image' | 'content' | 'authorization';
export type LaunchStepState = 'pending' | 'current' | 'complete' | 'failed';

export interface LaunchStepInput {
  status: string;
  failureCode?: string | null;
  failureMessage?: string | null;
  imageGenerationApproved?: boolean;
  imageProjectId?: string | null;
  listingDraftId?: string | null;
  approvedContentHash?: string | null;
  selectedPublishSnapshotId?: string | null;
  publishApprovedAt?: string | null;
  publishExecutionGrantHash?: string | null;
  publishExecutionGrantScope?: string | null;
}

export interface LaunchStepPresentation {
  id: LaunchStepId;
  labelKey: string;
  state: LaunchStepState;
  reason: string | null;
}

const labels: Record<LaunchStepId, string> = {
  economics: 'launchWizard.steps.economics',
  image: 'launchWizard.steps.image',
  content: 'launchWizard.steps.content',
  authorization: 'launchWizard.steps.authorization',
};

function hasInvalidImageKey(code?: string | null, message?: string | null): boolean {
  return code === 'IMAGE_PROVIDER_INVALID_KEY' ||
    /(?:INVALID_API_KEY|Invalid API key|image API 401)/iu.test(message ?? '');
}

function failureReason(code?: string | null, message?: string | null): string {
  if (hasInvalidImageKey(code, message)) return '图片生成通道 API Key 无效';
  return customerErrorPresentation(code).reason;
}

function isImageFailure(code?: string | null, message?: string | null): boolean {
  return Boolean(
    (code && /IMAGE|VISUAL|ASSET_PROVIDER/u.test(code)) ||
    /(?:所有场景生成失败|image API|INVALID_API_KEY|Invalid API key)/iu.test(message ?? ''),
  );
}

export function launchStepsPresentation(input: LaunchStepInput): LaunchStepPresentation[] {
  const steps: LaunchStepPresentation[] = (Object.keys(labels) as LaunchStepId[]).map((id) => ({
    id,
    labelKey: labels[id],
    state: 'pending',
    reason: null,
  }));
  const set = (id: LaunchStepId, state: LaunchStepState, reason: string | null = null) => {
    const step = steps.find((item) => item.id === id);
    if (step) Object.assign(step, { state, reason });
  };

  if (input.status === 'AWAITING_ECONOMICS_REVIEW') {
    set('economics', 'current');
    return steps;
  }
  set('economics', 'complete');

  if (input.status === 'FAILED' && isImageFailure(input.failureCode, input.failureMessage)) {
    set('image', 'failed', failureReason(input.failureCode, input.failureMessage));
    return steps;
  }
  if (
    ['QUEUED', 'GENERATING_IMAGES'].includes(input.status) &&
    !input.listingDraftId
  ) {
    set('image', 'current');
    return steps;
  }
  set('image', 'complete');

  if (input.status === 'FAILED' && !input.listingDraftId) {
    set('content', 'failed', failureReason(input.failureCode, input.failureMessage));
    return steps;
  }
  if (!input.listingDraftId || !input.approvedContentHash) {
    set('content', 'current');
    return steps;
  }
  set('content', 'complete');

  if (input.status === 'FAILED' || input.status === 'BLOCKED') {
    set('authorization', 'failed', failureReason(input.failureCode, input.failureMessage));
    return steps;
  }
  if (
    ['SUBMITTING_TO_OZON', 'SUBMITTED_TO_OZON', 'ACTIVE_ON_OZON'].includes(input.status) &&
    input.publishApprovedAt &&
    input.publishExecutionGrantHash
  ) {
    set('authorization', 'complete');
    return steps;
  }
  set('authorization', 'current');
  return steps;
}

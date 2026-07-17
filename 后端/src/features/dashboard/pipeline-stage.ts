export type PipelineStage =
  | 'RESEARCH'
  | 'EVIDENCE_REVIEW'
  | 'APPROVAL'
  | 'CONTENT_GENERATION'
  | 'PUBLISH_SNAPSHOT'
  | 'PUBLISHING'
  | 'MONITORING';

export type PipelineStageInput = Readonly<{
  kind: 'RESEARCH_RUN' | 'REVIEW_TASK' | 'PRODUCT_LAUNCH';
  status: string;
  errorCode?: string | null;
  hasSnapshot?: boolean;
}>;

export interface PipelineStageResult {
  stage: PipelineStage;
  blockedOn: string | null;
  errorCode: string | null;
}

export function derivePipelineStage(
  input: PipelineStageInput,
): PipelineStageResult {
  const errorCode = input.errorCode?.trim() || null;
  if (input.kind === 'RESEARCH_RUN') {
    if (input.status === 'PARTIAL') {
      return {
        stage: 'EVIDENCE_REVIEW',
        blockedOn: '补充独立需求证据',
        errorCode: errorCode ?? 'EVIDENCE_INSUFFICIENT',
      };
    }
    if (input.status === 'FAILED') {
      return {
        stage: 'RESEARCH',
        blockedOn: '选品执行失败，等待重试',
        errorCode,
      };
    }
    if (input.status === 'PAUSED' || input.status === 'STOPPED') {
      return {
        stage: 'RESEARCH',
        blockedOn: input.status === 'PAUSED' ? '任务已暂停' : '任务已安全停止',
        errorCode,
      };
    }
    return { stage: 'RESEARCH', blockedOn: null, errorCode };
  }

  if (input.kind === 'REVIEW_TASK') {
    return {
      stage: 'APPROVAL',
      blockedOn:
        input.status === 'REWORK' ? '等待补充或重新执行' : '等待人工审批',
      errorCode,
    };
  }

  if (input.status === 'QUEUED' || input.status === 'GENERATING_IMAGES') {
    return { stage: 'CONTENT_GENERATION', blockedOn: null, errorCode };
  }
  if (input.status === 'AWAITING_ECONOMICS_REVIEW') {
    return {
      stage: 'EVIDENCE_REVIEW',
      blockedOn: '等待人工核价或经济性复核',
      errorCode,
    };
  }
  if (input.status === 'AWAITING_PUBLISH_APPROVAL') {
    return {
      stage: 'PUBLISH_SNAPSHOT',
      blockedOn: '等待发布审批',
      errorCode,
    };
  }
  if (
    ['SUBMITTING_TO_OZON', 'RECOVERING', 'SUBMITTED_TO_OZON'].includes(
      input.status,
    )
  ) {
    return { stage: 'PUBLISHING', blockedOn: null, errorCode };
  }
  if (input.status === 'ACTIVE_ON_OZON') {
    return { stage: 'MONITORING', blockedOn: null, errorCode };
  }
  if (input.status === 'FAILED' || input.status === 'BLOCKED') {
    return {
      stage: input.hasSnapshot ? 'PUBLISHING' : 'CONTENT_GENERATION',
      blockedOn:
        input.status === 'FAILED'
          ? '发布失败，等待安全重试或人工处理'
          : '发布门禁阻止继续执行',
      errorCode,
    };
  }
  return { stage: 'CONTENT_GENERATION', blockedOn: null, errorCode };
}

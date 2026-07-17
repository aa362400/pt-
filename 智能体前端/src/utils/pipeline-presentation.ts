import { candidateChineseName } from './daily-product-research-candidate.ts';
import { customerErrorPresentation } from './customer-facing-language.ts';

export type PipelineStage =
  | 'RESEARCH'
  | 'EVIDENCE_REVIEW'
  | 'APPROVAL'
  | 'CONTENT_GENERATION'
  | 'PUBLISH_SNAPSHOT'
  | 'PUBLISHING'
  | 'MONITORING';

const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  RESEARCH: '选品',
  EVIDENCE_REVIEW: '证据与核价',
  APPROVAL: '人工审批',
  CONTENT_GENERATION: '商品资料与图片',
  PUBLISH_SNAPSHOT: '发布快照',
  PUBLISHING: 'Ozon 上架',
  MONITORING: '结果监控',
};

export function pipelineStageLabel(stage: string): string {
  return PIPELINE_STAGE_LABELS[stage as PipelineStage] ?? '待确认阶段';
}

export function pipelineStatusSummary(summary: {
  total: number;
  needsAttention: number;
  blocked: number;
  inProgress: number;
  monitoring: number;
  byStage: Record<string, number>;
}): string {
  return `待你处理 ${summary.needsAttention} 件 · 阻塞 ${summary.blocked} 件 · 执行中 ${summary.inProgress} 件 · 监控中 ${summary.monitoring} 件`;
}

export function pipelineItemTitle(item: {
  entityType: 'RESEARCH_RUN' | 'REVIEW_TASK' | 'PRODUCT_LAUNCH';
  title: string;
}): string {
  if (/\p{Script=Han}/u.test(item.title)) return item.title;
  return candidateChineseName({
    canonicalName: item.title,
    productType: '',
    rawSummary: null,
  });
}

export type WorkbenchStage = 'selection' | 'approval' | 'image' | 'listing' | 'publish';

export interface WorkbenchPipelineInput {
  entityType: 'RESEARCH_RUN' | 'REVIEW_TASK' | 'PRODUCT_LAUNCH';
  entityId: string;
  stage: string;
  status: string;
  errorCode: string | null;
  blockedOn: {
    type: 'USER_ACTION' | 'SYSTEM_RETRY' | 'CHANNEL_DOWN';
    label: string;
    link: string;
  } | null;
}

const WORKBENCH_STAGE_KEYS: Record<WorkbenchStage, string> = {
  selection: 'workbench.stages.selection',
  approval: 'workbench.stages.approval',
  image: 'workbench.stages.image',
  listing: 'workbench.stages.listing',
  publish: 'workbench.stages.publish',
};

export function workbenchStage(stage: string): WorkbenchStage {
  if (stage === 'RESEARCH') return 'selection';
  if (stage === 'EVIDENCE_REVIEW' || stage === 'APPROVAL') return 'approval';
  if (stage === 'CONTENT_GENERATION') return 'image';
  if (stage === 'PUBLISH_SNAPSHOT') return 'listing';
  return 'publish';
}

export function workbenchStageLabelKey(stage: WorkbenchStage): string {
  return WORKBENCH_STAGE_KEYS[stage];
}

export function workbenchAction(item: WorkbenchPipelineInput): {
  kind: 'retry' | 'navigate';
  labelKey: string;
  href: string;
} {
  const href = item.entityType === 'PRODUCT_LAUNCH'
    ? `/listing-generator?launch=${encodeURIComponent(item.entityId)}`
    : item.blockedOn?.link ?? '/workbench';
  if (item.blockedOn?.type === 'SYSTEM_RETRY') {
    return { kind: 'retry', labelKey: 'workbench.actions.retry', href };
  }
  if (item.stage === 'EVIDENCE_REVIEW') {
    return { kind: 'navigate', labelKey: 'workbench.actions.goPricing', href };
  }
  if (item.stage === 'APPROVAL' || item.stage === 'PUBLISH_SNAPSHOT') {
    return { kind: 'navigate', labelKey: 'workbench.actions.goReview', href };
  }
  if (item.blockedOn?.type === 'CHANNEL_DOWN') {
    return { kind: 'navigate', labelKey: 'workbench.actions.viewChannel', href };
  }
  return { kind: 'navigate', labelKey: 'workbench.actions.view', href };
}

export function pipelineUrgency(item: WorkbenchPipelineInput): number {
  if (item.blockedOn?.type === 'CHANNEL_DOWN') return 0;
  if (item.blockedOn?.type === 'SYSTEM_RETRY') return 1;
  if (item.errorCode) return 2;
  if (item.blockedOn?.type === 'USER_ACTION') return 3;
  return 4;
}

export function workbenchFailureReason(errorCode: string | null): string | null {
  return errorCode ? customerErrorPresentation(errorCode).reason : null;
}

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
  if (item.entityType !== 'PRODUCT_LAUNCH') return item.title;
  return candidateChineseName({
    canonicalName: item.title,
    productType: '',
    rawSummary: null,
  });
}
import { candidateChineseName } from './daily-product-research-candidate.ts';

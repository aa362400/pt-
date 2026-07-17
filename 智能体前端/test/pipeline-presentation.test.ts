import assert from 'node:assert/strict';
import test from 'node:test';

import {
  pipelineItemTitle,
  pipelineStageLabel,
  pipelineStatusSummary,
  pipelineUrgency,
  workbenchAction,
  workbenchFailureReason,
  workbenchStage,
} from '../src/utils/pipeline-presentation.ts';

test('pipeline stage labels are Chinese and cover the full path', () => {
  assert.deepEqual(
    [
      'RESEARCH',
      'EVIDENCE_REVIEW',
      'APPROVAL',
      'CONTENT_GENERATION',
      'PUBLISH_SNAPSHOT',
      'PUBLISHING',
      'MONITORING',
    ].map(pipelineStageLabel),
    ['选品', '证据与核价', '人工审批', '商品资料与图片', '发布快照', 'Ozon 上架', '结果监控'],
  );
});

test('product launch titles reuse the audited Chinese candidate naming rules', () => {
  assert.equal(
    pipelineItemTitle({
      entityType: 'PRODUCT_LAUNCH',
      title: '42 spool sewing thread organizer box transparent',
    }),
    '透明缝纫线收纳盒',
  );
  assert.equal(
    pipelineItemTitle({ entityType: 'REVIEW_TASK', title: '商品选品待处理' }),
    '商品选品待处理',
  );
});

test('research candidate titles also use the audited Chinese naming rules', () => {
  assert.equal(pipelineItemTitle({ entityType: 'RESEARCH_RUN', title: 'toothbrush cover' }), '牙刷保护套');
});

test('pipeline summary tells the customer exactly what needs attention', () => {
  assert.equal(
    pipelineStatusSummary({ total: 12, needsAttention: 5, blocked: 3, inProgress: 4, monitoring: 3, byStage: {} }),
    '待你处理 5 件 · 阻塞 3 件 · 执行中 4 件 · 监控中 3 件',
  );
});

test('workbench maps at least six runtime combinations into the five customer stages', () => {
  assert.deepEqual(
    [
      ['RESEARCH', 'RUNNING'],
      ['APPROVAL', 'PENDING'],
      ['EVIDENCE_REVIEW', 'AWAITING_ECONOMICS_REVIEW'],
      ['CONTENT_GENERATION', 'FAILED'],
      ['PUBLISH_SNAPSHOT', 'AWAITING_PUBLISH_APPROVAL'],
      ['MONITORING', 'ACTIVE_ON_OZON'],
    ].map(([stage]) => workbenchStage(stage)),
    ['selection', 'approval', 'approval', 'image', 'listing', 'publish'],
  );
});

test('workbench action mapping sends pricing, review, and retries to actionable routes', () => {
  const base = {
    entityType: 'REVIEW_TASK' as const,
    entityId: 'task-1',
    status: 'PENDING',
    errorCode: null,
  };
  assert.equal(workbenchAction({ ...base, stage: 'EVIDENCE_REVIEW', blockedOn: { type: 'USER_ACTION', label: '待核价', link: '/review?task=price' } }).labelKey, 'workbench.actions.goPricing');
  assert.equal(workbenchAction({ ...base, stage: 'APPROVAL', blockedOn: { type: 'USER_ACTION', label: '待审核', link: '/review?task=review' } }).labelKey, 'workbench.actions.goReview');
  assert.equal(workbenchAction({ ...base, entityType: 'RESEARCH_RUN', stage: 'RESEARCH', errorCode: 'EVIDENCE_INSUFFICIENT', blockedOn: { type: 'SYSTEM_RETRY', label: '重试', link: '/daily-product-research?run=1' } }).kind, 'retry');
});

test('workbench failures are Chinese and channel failures sort first', () => {
  assert.match(workbenchFailureReason('IMAGE_PROVIDER_INVALID_KEY') ?? '', /密钥|诊断代码/);
  assert.equal(pipelineUrgency({ entityType: 'PRODUCT_LAUNCH', entityId: 'launch-1', stage: 'CONTENT_GENERATION', status: 'FAILED', errorCode: 'IMAGE_PROVIDER_INVALID_KEY', blockedOn: { type: 'CHANNEL_DOWN', label: '通道不可用', link: '/enterprise-readiness' } }), 0);
});

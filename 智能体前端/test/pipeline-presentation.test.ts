import assert from 'node:assert/strict';
import test from 'node:test';

import {
  pipelineItemTitle,
  pipelineStageLabel,
  pipelineStatusSummary,
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

test('pipeline summary tells the customer exactly what needs attention', () => {
  assert.equal(
    pipelineStatusSummary({ total: 12, needsAttention: 5, blocked: 3, inProgress: 4, monitoring: 3, byStage: {} }),
    '待你处理 5 件 · 阻塞 3 件 · 执行中 4 件 · 监控中 3 件',
  );
});

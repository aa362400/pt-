import assert from 'node:assert/strict';
import test from 'node:test';
import {
  auditActionLabel,
  auditResourceLabel,
  summarizeAuditPayload,
} from '../src/utils/audit-presentation.ts';

test('audit labels are customer-readable', () => {
  assert.equal(auditActionLabel('ozon.product.completed'), '执行完成');
  assert.equal(auditActionLabel('product-research.evidence-review-created'), '证据不足，已转人工核验');
  assert.equal(auditResourceLabel('ExternalSubmission'), 'Ozon 外部提交');
  assert.equal(auditResourceLabel('REVIEW_TASK'), '审批任务');
  assert.equal(auditResourceLabel('ProfitCalculation'), '核价记录');
});

test('audit payload summary removes secrets and raw nested JSON', () => {
  const summary = summarizeAuditPayload({
    provider: 'OZON',
    humanApproved: true,
    apiKey: 'must-not-leak',
    response: { result: { taskId: 42 } },
  });

  assert.deepEqual(summary, [
    { label: '平台', value: 'OZON' },
    { label: '人工确认', value: '是' },
    { label: 'response', value: '1 个字段' },
  ]);
});

test('audit payload summary translates workflow states and damaged historic text', () => {
  const summary = summarizeAuditPayload({
    status: 'REWORK',
    reviewedAt: '2026-07-15T01:53:21.421Z',
    notes: '??????????,????????',
  });

  assert.equal(summary[0]?.value, '待重新处理');
  assert.match(summary[1]?.value ?? '', /2026/);
  assert.equal(summary[2]?.value, '历史记录文字不可读（原始数据已损坏）');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  auditActionLabel,
  auditResourceLabel,
  summarizeAuditPayload,
} from '../src/utils/audit-presentation.ts';

test('audit labels are customer-readable', () => {
  assert.equal(auditActionLabel('ozon.product.completed'), 'Execution completed');
  assert.equal(auditActionLabel('product-research.evidence-review-created'), 'Insufficient evidence; sent to human review');
  assert.equal(auditResourceLabel('ExternalSubmission'), 'Ozon external submission');
  assert.equal(auditResourceLabel('REVIEW_TASK'), 'Review task');
  assert.equal(auditResourceLabel('ProfitCalculation'), 'Pricing record');
});

test('audit payload summary removes secrets and raw nested JSON', () => {
  const summary = summarizeAuditPayload({
    provider: 'OZON',
    humanApproved: true,
    apiKey: 'must-not-leak',
    response: { result: { taskId: 42 } },
  });

  assert.deepEqual(summary, [
    { label: 'Platform', value: 'OZON' },
    { label: 'Human approval', value: 'Yes' },
    { label: 'response', value: '1 fields' },
  ]);
});

test('audit payload summary translates workflow states and damaged historic text', () => {
  const summary = summarizeAuditPayload({
    status: 'REWORK',
    reviewedAt: '2026-07-15T01:53:21.421Z',
    notes: '??????????,????????',
  });

  assert.equal(summary[0]?.value, 'Needs rework');
  assert.match(summary[1]?.value ?? '', /2026/);
  assert.equal(summary[2]?.value, 'Historical text is unreadable; raw data is corrupted');
});

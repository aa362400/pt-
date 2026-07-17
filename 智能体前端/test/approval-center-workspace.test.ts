import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  approvalProposalWorkQueue,
  reviewTaskWorkQueue,
} from '../src/utils/approval-center-workspace.ts';
import { safeExternalHttpsUrl } from '../src/utils/safe-external-url.ts';

test('external evidence URLs reject local networks, credentials, and unusual ports', () => {
  assert.equal(
    safeExternalHttpsUrl('https://images.example.com/product.jpg'),
    'https://images.example.com/product.jpg',
  );
  for (const unsafe of [
    'https://localhost/private',
    'https://127.0.0.1/private',
    'https://10.0.0.2/private',
    'https://169.254.169.254/latest/meta-data',
    'https://192.168.1.2/private',
    'https://service.local/private',
    'https://user:secret@example.com/image.jpg',
    'https://example.com:8443/image.jpg',
    'http://example.com/image.jpg',
  ]) {
    assert.equal(safeExternalHttpsUrl(unsafe), null, unsafe);
  }
});

test('approval workspace separates actionable work from failed runs and processed history', () => {
  assert.equal(
    reviewTaskWorkQueue({
      status: 'PENDING',
      entityType: 'PRODUCT_RESEARCH',
      agentRunStatus: null,
    }),
    'actionable',
  );
  assert.equal(
    reviewTaskWorkQueue({
      status: 'PENDING',
      entityType: 'AGENT_RUN',
      agentRunStatus: 'FAILED',
    }),
    'needs_attention',
  );
  assert.equal(
    reviewTaskWorkQueue({
      status: 'REWORK',
      entityType: 'AGENT_RUN',
      agentRunStatus: 'FAILED',
    }),
    'needs_attention',
  );
  assert.equal(
    reviewTaskWorkQueue({
      status: 'APPROVED',
      entityType: 'PRODUCT_RESEARCH',
      agentRunStatus: null,
    }),
    'processed',
  );
  assert.equal(approvalProposalWorkQueue('CHANGES_REQUESTED'), 'actionable');
  assert.equal(approvalProposalWorkQueue('FAILED'), 'needs_attention');
  assert.equal(approvalProposalWorkQueue('EXECUTED'), 'processed');
});

test('approval center exposes a real image-backed work queue without fake pagination', () => {
  const component = readFileSync(
    new URL('../src/figma-exact/ApprovalCenter.tsx', import.meta.url),
    'utf8',
  );
  const page = readFileSync(
    new URL('../src/pages-v2/ApprovalCenterV2.tsx', import.meta.url),
    'utf8',
  );

  assert.match(component, /workQueue:/);
  assert.match(component, /imageUrl\?:/);
  assert.match(component, /待我处理/);
  assert.match(component, /异常与重做/);
  assert.doesNotMatch(component, />2<|>3</);
  assert.match(page, /selectedTask\.entityType === 'PRODUCT_RESEARCH'/);
  assert.match(page, /review-draft-opened[\s\S]{0,250}暂不采用/);
  assert.match(page, /review-draft-opened[\s\S]{0,250}要求补充证据/);
  assert.match(page, /个图片证据完整/);
  assert.doesNotMatch(page, /个候选图链完整/);
});

test('product research approval preview keeps evidence links after image failure and uses cross-market wording', () => {
  const panel = readFileSync(
    new URL(
      '../src/components/review/ProductResearchLaunchPanel.tsx',
      import.meta.url,
    ),
    'utf8',
  );
  assert.match(panel, /safeExternalHttpsUrl/);
  assert.match(panel, /onError/);
  assert.match(panel, /打开图片证据页/);
  assert.match(panel, /实际市场检索/);
  assert.doesNotMatch(panel, /实际 Ozon 检索/);
  assert.match(panel, /核价与利润证据尚未通过/);
  assert.match(panel, /全球多平台/);
  assert.match(panel, /真实市场证据/);
  assert.doesNotMatch(panel, />Ozon 证据</);
  assert.doesNotMatch(panel, /Listing|Logo/);
});

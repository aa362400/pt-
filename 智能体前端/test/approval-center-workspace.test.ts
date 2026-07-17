import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  approvalProposalWorkQueue,
  customerApprovalNarrative,
  reviewTaskWorkQueue,
} from '../src/utils/approval-center-workspace.ts';
import {
  safeExternalEvidenceUrl,
  safeReviewImageUrl,
} from '../src/utils/safe-external-url.ts';

test('external evidence links reject local networks, arbitrary hosts, and multi-tenant infrastructure', () => {
  assert.equal(
    safeExternalEvidenceUrl('https://www.ozon.ru/product/1'),
    'https://www.ozon.ru/product/1',
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
    'https://attacker.example.com/image.jpg',
    'https://ozon.ru.evil.example/image.jpg',
    'https://customer-bucket.s3.amazonaws.com/image.jpg',
    'https://d111111abcdef8.cloudfront.net/image.jpg',
  ]) {
    assert.equal(safeExternalEvidenceUrl(unsafe), null, unsafe);
  }
});

test('automatic review images allow only dedicated CDNs or the controlled same-origin Agent route', () => {
  assert.equal(
    safeReviewImageUrl('https://cdn1.ozone.ru/product.jpg'),
    'https://cdn1.ozone.ru/product.jpg',
  );
  assert.equal(
    safeReviewImageUrl('/agent/api/image/session_42/output/main.jpg'),
    '/agent/api/image/session_42/output/main.jpg',
  );
  assert.equal(
    safeReviewImageUrl(
      'https://shop.example/agent/api/image/session_42/main.jpg',
      'https://shop.example',
    ),
    'https://shop.example/agent/api/image/session_42/main.jpg',
  );
  for (const unsafe of [
    'http://localhost/image.jpg',
    'https://127.0.0.1/image.jpg',
    'https://10.0.0.2/image.jpg',
    'https://attacker.example/image.jpg',
    'https://www.ozon.ru/product/1',
    'https://customer-bucket.s3.amazonaws.com/image.jpg',
    'https://d111111abcdef8.cloudfront.net/image.jpg',
    '/agent/api/image/session_42/../../private.jpg',
    '/agent/api/image/session_42/main.jpg?redirect=http://127.0.0.1',
    '//attacker.example/agent/api/image/session_42/main.jpg',
  ]) {
    assert.equal(safeReviewImageUrl(unsafe), null, unsafe);
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
  assert.equal(approvalProposalWorkQueue('UNKNOWN'), 'needs_attention');
  assert.equal(approvalProposalWorkQueue('FUTURE_STATE'), 'needs_attention');
  assert.equal(approvalProposalWorkQueue('EXECUTED'), 'processed');
});

test('approval narrative translates the historical automotive-fan explanation into Chinese', () => {
  const historicalEnglish = 'Ozon evidence shows five portable-fan listings, but none is explicitly identified as an automotive fan, so category relevance is uncertain. The listings include stroller, neck-worn, bladeless, illuminated, and humidifying models. Price mentions span 434–600 RUB, but both come from search snippets or review/comparison text and may not represent current selling prices. No reliable rating or demand data was supplied.';
  const result = customerApprovalNarrative([historicalEnglish]);

  assert.equal(
    result.displayText,
    'Ozon 证据显示了 5 个便携风扇商品，但没有任何商品被明确识别为汽车风扇，因此类目相关性仍不确定。结果包括婴儿车风扇、挂脖风扇、无叶风扇、带灯风扇和加湿风扇。可见价格为 434–600 卢布，但两项价格都来自搜索摘要或评测、对比文本，可能不是当前在售价。现有证据未提供可靠的评分或需求数据。',
  );
  assert.equal(result.source, 'translated');
  assert.equal(result.technicalText, historicalEnglish);
});

test('approval narrative hides unknown English from the customer surface but retains it for technical details', () => {
  const unknownEnglish = 'A newly introduced provider explanation that has no reviewed translation yet.';
  const result = customerApprovalNarrative([unknownEnglish]);

  assert.equal(
    result.displayText,
    '历史审核说明不是中文，原文已收起；请结合任务状态与证据人工核对。',
  );
  assert.equal(result.source, 'fallback');
  assert.equal(result.technicalText, unknownEnglish);
  assert.doesNotMatch(result.displayText, /provider explanation/i);
});

test('approval narrative keeps Chinese content and prefers it over an unknown foreign fallback', () => {
  const result = customerApprovalNarrative([
    'Unknown historical explanation.',
    '这是后端已经返回的中文审核说明。',
  ]);

  assert.equal(result.displayText, '这是后端已经返回的中文审核说明。');
  assert.equal(result.source, 'original-chinese');
  assert.equal(result.technicalText, 'Unknown historical explanation.');
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
  assert.match(component, /customerApprovalNarrative/);
  assert.match(page, /getCustomerReviewNarrative/);
  assert.match(page, /narrative\.technicalText/);
  assert.match(page, /useSearchParams/);
  assert.match(page, /searchParams\.get\('task'\)/);
  assert.match(page, /manualPricingFocusRef/);
  assert.match(page, /retryFailedTask/);
  assert.match(page, /<ApprovalWorkspace/);
  assert.match(page, /<details/);
  assert.doesNotMatch(page, /reason:\s*item\.notification\.body/);
  assert.doesNotMatch(page, />\{item\.notification\.body\s*\|\|/);
});

test('product research approval preview keeps evidence links after image failure and uses cross-market wording', () => {
  const panel = readFileSync(
    new URL(
      '../src/components/review/ProductResearchLaunchPanel.tsx',
      import.meta.url,
    ),
    'utf8',
  );
  assert.match(panel, /safeReviewImageUrl/);
  assert.match(panel, /customerApprovalNarrative/);
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

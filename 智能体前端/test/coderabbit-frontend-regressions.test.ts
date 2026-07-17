import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createCsv } from '../src/utils/csv.ts';
import {
  firstSafeExternalEvidenceUrl,
  safeExternalEvidenceUrl,
  safeReviewImageUrl,
} from '../src/utils/safe-external-url.ts';
import {
  keywordMetricEvidenceForDisplay,
  finiteTrendValues,
} from '../src/utils/keyword-evidence.ts';
import { keywordDataForEvidenceDisplay } from '../src/utils/keyword-page-evidence.ts';
import { organizationNameForCustomer } from '../src/utils/profile-display.ts';
import { isCustomerChatClosed } from '../src/utils/customer-service-presentation.ts';
import { parseInventoryStockInput } from '../src/utils/product-management-presentation.ts';
import { isOzonProductSellable } from '../src/utils/ozon-product-status.ts';
import { ozonPricingInputError } from '../src/utils/ozon-pricing-validation.ts';

const source = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('CSV export neutralizes spreadsheet formulas after optional leading whitespace', () => {
  const csv = createCsv([
    ['name', 'value'],
    ['danger', '=HYPERLINK("https://evil.example")'],
    ['space', '  +SUM(1,2)'],
    ['at', '@cmd'],
    ['minus', '-10'],
  ]);
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/evil\.example""\)"/);
  assert.match(csv, /"'  \+SUM\(1,2\)"/);
  assert.match(csv, /"'@cmd"/);
  assert.match(csv, /"'-10"/);
});

test('external evidence and automatic images have separate trust boundaries', () => {
  assert.equal(safeExternalEvidenceUrl('https://www.ozon.ru/product/1'), 'https://www.ozon.ru/product/1');
  assert.equal(safeExternalEvidenceUrl('https://ozon.ru.evil.example/product/1'), null);
  assert.equal(
    firstSafeExternalEvidenceUrl(
      'https://attacker.example/image.jpg',
      'https://detail.1688.com/offer/123.html',
    ),
    'https://detail.1688.com/offer/123.html',
  );
  assert.equal(safeReviewImageUrl('https://www.ozon.ru/product/1'), null);
  assert.equal(
    safeReviewImageUrl('https://cdn1.ozone.ru/product.jpg'),
    'https://cdn1.ozone.ru/product.jpg',
  );
  assert.equal(
    safeReviewImageUrl('https://d111111abcdef8.cloudfront.net/redirect'),
    null,
  );
});

test('keyword evidence rejects impossible, future, and stale timestamps', () => {
  const now = Date.parse('2026-07-17T12:00:00.000Z');
  const evidence = (observedAt: string) => ({
    provider: 'Ozon',
    sourceReference: 'report-42',
    observedAt,
    method: 'marketplace keyword export',
    sourceKind: 'MARKETPLACE_API',
  });
  assert.equal(keywordMetricEvidenceForDisplay(evidence('2026-02-30T00:00:00Z'), now), null);
  assert.equal(keywordMetricEvidenceForDisplay(evidence('2026-07-18T00:00:00Z'), now), null);
  assert.equal(keywordMetricEvidenceForDisplay(evidence('2025-01-01T00:00:00Z'), now), null);
  assert.ok(keywordMetricEvidenceForDisplay(evidence('2026-07-16T00:00:00Z'), now));
});

test('all keyword metric consumers fail closed without fresh auditable evidence', () => {
  const base = {
    id: 'keyword-1',
    keyword: '轻小件',
    searchVolume: 1234,
    trend: 'up' as const,
    trendData: [1, Number.NaN, Number.POSITIVE_INFINITY, 2],
    competition: 'low' as const,
    difficulty: 22,
    opportunityScore: 101,
    platform: 'Ozon',
    platformIcon: 'ozon',
    metricStatus: 'EVIDENCE_BACKED' as const,
    metricEvidence: {
      provider: 'Ozon',
      sourceReference: 'report-42',
      observedAt: new Date().toISOString(),
      method: 'marketplace keyword export',
      sourceKind: 'MARKETPLACE_API' as const,
    },
  };
  const displayed = keywordDataForEvidenceDisplay(base);
  assert.deepEqual(displayed.trendData, [1, 2]);
  assert.equal(displayed.opportunityScore, null);
  assert.deepEqual(finiteTrendValues([1, Number.NaN, Infinity, 2]), [1, 2]);
  assert.deepEqual(
    keywordDataForEvidenceDisplay({ ...base, metricStatus: 'DATA_INSUFFICIENT' }),
    {
      ...base,
      searchVolume: null,
      trend: 'stable',
      trendData: [],
      difficulty: null,
      opportunityScore: null,
      metricStatus: 'DATA_INSUFFICIENT',
      metricEvidence: null,
    },
  );
});

test('customer names with ordinary digits remain visible while opaque IDs stay masked', () => {
  assert.equal(organizationNameForCustomer('3M'), '3M');
  assert.equal(organizationNameForCustomer('Studio54'), 'Studio54');
  assert.equal(organizationNameForCustomer('Shop2026'), 'Shop2026');
  assert.equal(organizationNameForCustomer('aa362400'), '当前组织');
});

test('chat, inventory, Ozon sale state, and pricing bounds use exact semantics', () => {
  assert.equal(isCustomerChatClosed('close'), true);
  assert.equal(isCustomerChatClosed('RESOLVED'), true);
  assert.equal(isCustomerChatClosed('OPEN'), false);
  assert.equal(parseInventoryStockInput(''), null);
  assert.equal(parseInventoryStockInput('0'), 0);
  assert.equal(parseInventoryStockInput('2.5'), undefined);
  assert.equal(isOzonProductSellable('ACTIVE'), true);
  assert.equal(isOzonProductSellable('IN_SALE'), true);
  assert.equal(isOzonProductSellable('INACTIVE'), false);
  assert.equal(isOzonProductSellable('NOT_ACTIVE'), false);
  assert.match(
    ozonPricingInputError({ purchaseCost: Number.POSITIVE_INFINITY }) ?? '',
    /有限数字/,
  );
  assert.match(ozonPricingInputError({ purchaseCost: 0 }) ?? '', /大于 0/);
  assert.match(ozonPricingInputError({ targetMarginRate: 1.01 }) ?? '', /0% 到 100%/);
  assert.equal(
    ozonPricingInputError({
      purchaseCost: 12,
      weightGram: 100,
      otherCost: 0,
      targetMarginRate: 0.5,
      advertisingRate: 0.1,
      fixedCostRate: 0.05,
      exchangeRate: 12,
      listingMultiplier: 1.2,
    }),
    null,
  );
});

test('page state guards prevent stale or hidden records from remaining actionable', () => {
  const customerPage = source('../src/figma-exact/CustomerService.tsx');
  const dailyPage = source('../src/pages/DailyProductResearch.tsx');
  const launchPanel = source('../src/components/review/ProductResearchLaunchPanel.tsx');
  assert.match(customerPage, /visibleConversations\.find/);
  assert.match(customerPage, /const nextConversation = visibleConversations\[0\]/);
  assert.match(dailyPage, /candidateDetailRequestIdRef/);
  assert.match(dailyPage, /requestId !== candidateDetailRequestIdRef\.current/);
  assert.match(dailyPage, /setCandidates\(\[\]\)[\s\S]{0,180}setSourceHealth\(\[\]\)[\s\S]{0,180}setArtifacts\(\[\]\)/);
  assert.match(launchPanel, /setDraft\(\{ \.\.\.EMPTY_PUBLICATION_DRAFT \}\)/);
  assert.match(launchPanel, /firstSafeExternalEvidenceUrl\([\s\S]{0,100}candidate\.imageEvidenceUrl[\s\S]{0,100}candidate\.productUrl/);
  assert.match(launchPanel, /function asGeneratedImages[\s\S]{0,500}safeReviewImageUrl\(record\.url\)/);
});

test('approval details never revive generic HTTP URLs or raw generated assets', () => {
  const approvalPage = source('../src/pages-v2/ApprovalCenterV2.tsx');
  assert.doesNotMatch(approvalPage, /function safeHttpUrl/);
  assert.doesNotMatch(approvalPage, /\.map\(safeHttpUrl\)/);
  assert.match(approvalPage, /const directImageUrl = safeReviewImageUrl\(item\.url\)/);
  assert.match(approvalPage, /const directEvidenceUrl = safeExternalEvidenceUrl\(item\.url\)/);
  assert.match(approvalPage, /\.map\(\(value\) => safeReviewImageUrl\(value\)\)/);
});

test('write workflows preserve authoritative values and do not invite duplicate retries', () => {
  const automationPage = source('../src/pages-v2/AutomationFlowV2.tsx');
  const listingApi = source('../src/api/listings.ts');
  const approvalPage = source('../src/pages-v2/ApprovalCenterV2.tsx');
  const roadmapPage = source('../src/pages/AgentRoadmap.tsx');
  assert.match(automationPage, /name: nextDetail\.name,[\s\S]{0,80}description: nextDetail\.description/);
  assert.doesNotMatch(automationPage, /name: editablePresentation\.name/);
  assert.match(listingApi, /data\.status === 'draft'[\s\S]{0,50}\? 'DRAFT'/);
  assert.match(approvalPage, /任务已创建，但最新状态刷新失败[\s\S]{0,100}请勿重复提交/);
  assert.match(roadmapPage, /setAcceptanceError\(null\);\s*setLastAcceptanceMessage\(null\);/);
});

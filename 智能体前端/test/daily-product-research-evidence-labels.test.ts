import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { marketEvidenceSourceLabel } from '../src/utils/market-evidence-source.ts';
import { candidateDecisionDisplayStatus } from '../src/utils/daily-product-research-status.ts';

const pageSource = readFileSync(
  new URL('../src/pages/DailyProductResearch.tsx', import.meta.url),
  'utf8',
);
const apiSource = readFileSync(
  new URL('../src/api/dailyProductResearch.ts', import.meta.url),
  'utf8',
);

test('market evidence labels preserve the actual marketplace identity', () => {
  assert.equal(marketEvidenceSourceLabel('ozon_public_listings'), 'Ozon');
  assert.equal(marketEvidenceSourceLabel('ozon_public_search_sample'), 'Ozon');
  assert.equal(
    marketEvidenceSourceLabel('1688_public_sourcing_lead'),
    '1688 货源线索',
  );
  assert.equal(marketEvidenceSourceLabel('aliexpress_public_search'), 'AliExpress');
  assert.equal(marketEvidenceSourceLabel('google_shopping_public_sample'), 'Google Shopping');
  assert.equal(marketEvidenceSourceLabel('walmart_public_search'), 'Walmart');
  assert.equal(
    marketEvidenceSourceLabel('custom_verified_source'),
    '其他已授权市场来源',
  );
});

test('daily candidate evidence UI never labels every source as Ozon', () => {
  assert.match(pageSource, /marketEvidenceSourceLabel\(signal\.source\)/);
  assert.match(pageSource, /打开原始来源/);
  assert.doesNotMatch(pageSource, /Ozon 真实证据/);
  assert.doesNotMatch(pageSource, /打开 Ozon 来源/);
});

test('manual daily research starts one ten-candidate batch', () => {
  assert.match(pageSource, /candidateLimit:\s*10/);
  assert.match(pageSource, /topLimit:\s*10/);
  assert.doesNotMatch(pageSource, /candidateLimit:\s*300/);
});

test('customer pricing switch reaches both manual runs and the saved schedule', () => {
  assert.match(pageSource, /aria-label="人工核价"/);
  assert.match(pageSource, /setPricingMode\(event\.target\.checked \? "MANUAL" : "AUTO"\)/);
  assert.match(pageSource, /MANUAL_PRICING_REQUIRED:\s*"待人工核价"/);
  assert.match(pageSource, /1688 公开货源线索/);
  assert.match(pageSource, /打开 1688 原始商品页/);
  assert.match(pageSource, /用该词打开 1688 搜索/);
  assert.match(pageSource, /不代表已有匹配供应商/);
  assert.match(apiSource, /export type ResearchPricingMode = "AUTO" \| "MANUAL"/);
  assert.match(apiSource, /pricingMode\?: ResearchPricingMode/);
  assert.match(apiSource, /pricingMode: ResearchPricingMode/);
});

test('an Ozon supply rejection stays rejected even when manual pricing is required', () => {
  assert.equal(
    candidateDecisionDisplayStatus('REJECT', [
      'MANUAL_PRICING_REQUIRED',
      'OZON_PUBLIC_SUPPLY_NOT_LOW',
    ]),
    'REJECT',
  );
  assert.equal(
    candidateDecisionDisplayStatus('HOLD', ['MANUAL_PRICING_REQUIRED']),
    'MANUAL_PRICING_REQUIRED',
  );
});

test('candidate actions obey backend capabilities instead of exposing a guaranteed 400', () => {
  assert.match(
    pageSource,
    /!candidateDetail\.capabilities\.allowedActions\.includes\(\s*"reject_candidate"/,
  );
});

test('daily run UI surfaces batch, provenance, budget, search, and config telemetry', () => {
  assert.match(pageSource, /researchBatchTelemetry\(selectedRun, candidates\.length\)/);
  assert.match(pageSource, /runIssuePresentation\(selectedRun\)/);
  assert.match(pageSource, /sourceEvidenceMode\(source\)/);
  assert.match(pageSource, /sourceExecutionTelemetry\(source\)/);
  assert.match(pageSource, /请求候选/);
  assert.match(pageSource, /处理候选/);
  assert.match(pageSource, /批次短缺/);
  assert.match(pageSource, /证据模式/);
  assert.match(pageSource, /执行预算 \/ 搜索/);
  assert.match(pageSource, /selectedRun\.configVersion/);
  assert.match(pageSource, /历史排除/);
  assert.match(pageSource, /1688 重复货源/);
  assert.match(pageSource, /1688 尝试/);
  assert.match(pageSource, /未映射/);
  assert.match(pageSource, /无结果/);
  assert.match(pageSource, /链接拒绝/);
  assert.match(pageSource, /词不匹配/);
  assert.match(apiSource, /excludedByHistoryCount\?: number/);
  assert.match(apiSource, /duplicateSourcingOfferCount\?: number/);
  assert.match(apiSource, /sourcingSearchAttemptCount\?: number/);
  assert.match(apiSource, /sourcingUnmappedConceptCount\?: number/);
  assert.match(apiSource, /sourcingNoResultCount\?: number/);
  assert.match(apiSource, /sourcingInvalidUrlCount\?: number/);
  assert.match(apiSource, /sourcingTermMismatchCount\?: number/);
});

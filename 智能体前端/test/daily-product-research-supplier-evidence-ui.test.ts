import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  supplierOfferDetailUrl,
  supplierOfferImageUrl,
} from '../src/utils/daily-product-research-candidate.ts';

const apiSource = readFileSync(
  new URL('../src/api/dailyProductResearch.ts', import.meta.url),
  'utf8',
);
const pageSource = readFileSync(
  new URL('../src/pages/DailyProductResearch.tsx', import.meta.url),
  'utf8',
);

test('每日选品候选详情读取真实1688图片检索证据', () => {
  assert.match(apiSource, /export interface SupplierImageSearchEvidenceResponse/);
  assert.match(apiSource, /supplierImageSearchEvidence: \(id: string/);
  assert.match(
    apiSource,
    /`\/daily-product-research\/candidates\/\$\{encodeURIComponent\(id\)\}\/supplier-image-search-evidence`/,
  );
  assert.match(
    pageSource,
    /dailyProductResearchApi\.supplierImageSearchEvidence\(candidate\.id/,
  );
});

test('候选详情用中文展示1688商品图与不可核价提示', () => {
  assert.match(pageSource, /1688 图片找同款（真实接口）/);
  assert.match(pageSource, /CandidateEvidenceImage/);
  assert.match(pageSource, /仅为图片匹配后的展示信息，不能作为采购成本/);
  assert.match(pageSource, /打开 1688 商品页/);
  assert.match(pageSource, /本候选尚无成功的 1688 图片找同款记录/);
});

test('1688证据读取失败不会遮蔽候选详情', () => {
  assert.match(pageSource, /setSupplierEvidenceError/);
  assert.match(pageSource, /1688 图片找同款证据读取失败/);
  assert.match(pageSource, /Promise\.allSettled/);
});

test('1688商品图与详情链接只允许受控真实来源域名', () => {
  assert.equal(
    supplierOfferImageUrl('https://cbu01.alicdn.com/item.jpg'),
    'https://cbu01.alicdn.com/item.jpg',
  );
  assert.equal(
    supplierOfferDetailUrl('https://detail.1688.com/offer/123.html'),
    'https://detail.1688.com/offer/123.html',
  );
  assert.equal(
    supplierOfferImageUrl('https://i5.walmartimages.com/item.jpg'),
    null,
  );
  assert.equal(supplierOfferImageUrl('https://tracker.example/item.jpg'), null);
  assert.equal(supplierOfferDetailUrl('https://example.com/offer/123'), null);
  assert.equal(
    supplierOfferDetailUrl('https://shop.1688.com/offer/123.html'),
    null,
  );
  assert.equal(
    supplierOfferDetailUrl(
      'https://detail.1688.com/offer/123.html?access_token=secret',
    ),
    null,
  );
  assert.equal(
    supplierOfferDetailUrl('https://detail.1688.com/not-offer/123.html'),
    null,
  );
  assert.match(
    pageSource,
    /supplierOfferImageUrl\(\s*offer\.imageUrl,?\s*\)/,
  );
  assert.match(
    pageSource,
    /supplierOfferDetailUrl\(\s*offer\.detailUrl,?\s*\)/,
  );
});

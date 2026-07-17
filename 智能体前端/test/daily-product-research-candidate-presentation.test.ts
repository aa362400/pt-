import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  candidateChineseName,
  candidatePrimaryImage,
  candidateRawEvidence,
  safeHttpsUrl,
} from '../src/utils/daily-product-research-candidate.ts';
import {
  researchArtifactLabel,
  researchScoreComponentLabel,
  researchSignalMetricLabel,
  researchSignalUnitLabel,
  researchSourceLabel,
} from '../src/utils/daily-product-research-localization.ts';
import { marketEvidenceSourceLabel } from '../src/utils/market-evidence-source.ts';

const pageSource = readFileSync(
  new URL('../src/pages/DailyProductResearch.tsx', import.meta.url),
  'utf8',
);
const imageSource = readFileSync(
  new URL(
    '../src/components/research/CandidateEvidenceImage.tsx',
    import.meta.url,
  ),
  'utf8',
);

test('selects only provenance-backed HTTPS candidate images', () => {
  const rawSummary = {
    evidence: [
      {
        source: 'unsafe',
        imageUrl: 'javascript:alert(1)',
        imageEvidenceUrl: 'https://example.com/product/unsafe',
      },
      {
        source: 'untrusted_public_host',
        imageUrl: 'https://images.example.com/product.jpg',
        imageEvidenceUrl: 'https://shop.example.com/product/42',
      },
      {
        source: 'google_shopping_public_sample',
        imageUrl:
          'https://encrypted-tbn1.gstatic.com/shopping?q=real-product-image',
        imageEvidenceUrl:
          'https://www.google.com/search?ibp=oshop&q=desk+organizer',
        title: 'Real product evidence',
        sourcingQueryZh: '桌面收纳盒',
      },
    ],
  };

  assert.equal(safeHttpsUrl('http://images.example.com/a.jpg'), null);
  assert.equal(safeHttpsUrl('https://user:pass@example.com/a.jpg'), null);
  assert.equal(safeHttpsUrl('https://localhost/a.jpg'), null);
  assert.equal(safeHttpsUrl('https://127.0.0.1/a.jpg'), null);
  assert.equal(safeHttpsUrl('https://10.0.0.8/a.jpg'), null);
  assert.equal(safeHttpsUrl('https://172.16.0.8/a.jpg'), null);
  assert.equal(safeHttpsUrl('https://192.168.0.8/a.jpg'), null);
  assert.equal(safeHttpsUrl('https://169.254.169.254/latest/meta-data'), null);
  assert.equal(safeHttpsUrl('https://[::1]/a.jpg'), null);
  assert.equal(safeHttpsUrl('https://supplier.local/a.jpg'), null);
  assert.equal(safeHttpsUrl('https://images.example.com:8443/a.jpg'), null);
  assert.equal(
    safeHttpsUrl('https://encrypted-tbn1.gstatic.com/shopping?q=a'),
    'https://encrypted-tbn1.gstatic.com/shopping?q=a',
  );
  assert.equal(candidateRawEvidence(rawSummary).length, 3);
  assert.deepEqual(candidatePrimaryImage(rawSummary), {
    imageUrl:
      'https://encrypted-tbn1.gstatic.com/shopping?q=real-product-image',
    evidenceUrl:
      'https://www.google.com/search?ibp=oshop&q=desk+organizer',
    source: 'google_shopping_public_sample',
    title: 'Real product evidence',
  });
});

test('treats null and malformed raw summaries as untrusted empty data', () => {
  assert.deepEqual(candidateRawEvidence(null), []);
  assert.deepEqual(candidateRawEvidence(undefined), []);
  assert.deepEqual(candidateRawEvidence('not-an-object'), []);
  assert.deepEqual(candidateRawEvidence({ evidence: [null, [], 1] }), []);
  assert.equal(candidatePrimaryImage(null), null);
  assert.equal(
    candidateChineseName({
      canonicalName: 'pencil case',
      productType: 'pencil case',
      rawSummary: null,
    }),
    '笔袋',
  );
});

test('uses a controlled Chinese customer name and never falls back to English', () => {
  assert.equal(
    candidateChineseName({
      canonicalName: 'stackable desk organizer',
      productType: 'desk organizer',
      displayNameZh: '可叠放桌面收纳盒',
      rawSummary: null,
    }),
    '可叠放桌面收纳盒',
  );
  assert.equal(
    candidateChineseName({
      canonicalName: 'desk organizer',
      productType: 'desk organizer',
      rawSummary: {
        evidence: [
          {
            source: 'temu_public_search',
            sourcingQueryZh: '桌面收纳盒',
          },
        ],
      },
    }),
    '桌面收纳盒',
  );
  assert.equal(
    candidateChineseName({
      canonicalName: 'pencil case double layer',
      productType: 'pencil case',
      rawSummary: {
        evidence: [
          {
            source: 'temu_public_search',
            sourcingQueryZh: '拉链笔袋',
          },
        ],
      },
    }),
    '双层拉链笔袋',
  );
  assert.equal(
    candidateChineseName({
      canonicalName: 'transparent mesh pencil case',
      productType: 'pencil case',
      rawSummary: {
        evidence: [
          {
            source: 'walmart_public_search',
            sourcingQueryZh: '拉链笔袋',
          },
        ],
      },
    }),
    '透明网纱拉链笔袋',
  );
  assert.equal(
    candidateChineseName({
      canonicalName: 'stackable desk organizer',
      productType: 'desk organizer',
      rawSummary: {
        evidence: [
          {
            source: 'untrusted',
            sourcingQueryZh: '桌面 organizer',
          },
        ],
      },
    }),
    '可叠放桌面收纳盒',
  );
  assert.equal(
    candidateChineseName({
      canonicalName: 'pencil pouch bulk',
      productType: 'pencil pouch',
      rawSummary: { evidence: [] },
    }),
    '批量装笔袋',
  );
  assert.equal(
    candidateChineseName({
      canonicalName: 'unmapped gadget',
      productType: 'unknown widget',
      rawSummary: { evidence: [] },
    }),
    '中文名称待确认',
  );
  assert.doesNotMatch(
    candidateChineseName({
      canonicalName: 'luggage tag pu',
      productType: 'luggage tag',
      rawSummary: { evidence: [] },
    }),
    /[a-z]/i,
  );
});

test('latest real-run canonical names use deterministic audited Chinese mappings', () => {
  const cases = [
    ['hard glasses case', '眼镜盒'],
    ['aluminum hard shell eyeglasses case', '铝合金硬壳眼镜盒'],
    ['badge holder', '证件卡套'],
    ['id tag work card sleeve', '工牌卡套'],
    ['hard plastic badge holder', '硬质塑料工牌卡套'],
    ['transparent badge holder', '透明工牌卡套'],
    ['curtain tieback holder', '窗帘绑带固定扣'],
    ['earphone storage case', '耳机收纳盒'],
    ['earphone storage pouch', '耳机收纳袋'],
    ['sewing thread organizer', '缝纫线收纳盒'],
  ] as const;

  for (const [canonicalName, expected] of cases) {
    assert.equal(
      candidateChineseName({
        canonicalName,
        productType: canonicalName,
        rawSummary: { evidence: [] },
      }),
      expected,
      canonicalName,
    );
  }
});

test('newest real scheduled batch never exposes untranslated product names', () => {
  const cases = [
    ['cable label tag box', '线缆标签牌'],
    ['makeup brush protector', '化妆刷保护套'],
    ['makeup brush protector mesh sleeve', '网纱化妆刷保护套'],
    ['toothbrush head cover', '牙刷头保护套'],
    ['toothbrush cover case', '牙刷保护盒'],
    ['cable organizer clip', '理线夹'],
    ['hook and loop cable tie', '魔术贴理线带'],
    ['pill storage pouch', '药片收纳袋'],
    ['travel storage bag', '旅行收纳袋'],
    ['shoe storage bag', '鞋子收纳袋'],
  ] as const;

  for (const [canonicalName, expected] of cases) {
    assert.equal(
      candidateChineseName({
        canonicalName,
        productType: canonicalName,
        rawSummary: { evidence: [] },
      }),
      expected,
      canonicalName,
    );
  }
});

test('v18 real manual batch uses audited Chinese names for newly observed candidates', () => {
  const cases = [
    [
      'phone sock anti slip thigh pouch card holder',
      '防滑大腿手机卡片收纳袋',
    ],
    [
      'sewing thread storage box portable compartment',
      '便携分格缝纫线收纳盒',
    ],
  ] as const;

  for (const [canonicalName, expected] of cases) {
    assert.equal(
      candidateChineseName({
        canonicalName,
        productType: canonicalName,
        rawSummary: { evidence: [] },
      }),
      expected,
      canonicalName,
    );
  }
});

test('daily candidate table and detail share the same Chinese-name resolver', () => {
  assert.match(
    pageSource,
    /const customerName = candidateChineseName\(candidate\)/,
  );
  assert.match(
    pageSource,
    /const candidateDetailChineseName = candidateDetail\s*\? candidateChineseName\(candidateDetail\)/,
  );
  assert.match(pageSource, /\{customerName\}/);
  assert.match(pageSource, /\{candidateDetailChineseName\}/);
});

test('customer-facing daily research identifiers have Chinese labels', () => {
  assert.equal(researchSourceLabel('global_marketplace_discovery'), '全球市场公开检索');
  assert.equal(researchSourceLabel('manual_import'), '人工或表格导入');
  assert.equal(researchSourceLabel('ozon_verified_evidence_cache'), 'Ozon 已验证证据缓存');
  assert.equal(researchScoreComponentLabel('competition'), '竞争程度');
  assert.equal(researchArtifactLabel('SOURCE_HEALTH_JSON'), '来源健康报告');
  assert.equal(researchSignalMetricLabel('reviews'), '评论数量');
  assert.equal(researchSignalMetricLabel('stars'), '商品评分');
  assert.equal(researchSignalUnitLabel('unknown_unit'), '单位未标注');
  assert.equal(
    marketEvidenceSourceLabel('ozon_public_search_cache'),
    'Ozon 公开搜索缓存',
  );
  assert.equal(
    marketEvidenceSourceLabel('new_unmapped_source'),
    '其他已授权市场来源',
  );
});

test('daily research page renders real images with accessible failure handling', () => {
  assert.match(pageSource, /CandidateEvidenceImage/);
  assert.match(pageSource, /candidateChineseName/);
  assert.match(pageSource, /商品图片/);
  assert.match(imageSource, /loading="lazy"/);
  assert.match(imageSource, /decoding="async"/);
  assert.match(imageSource, /referrerPolicy="no-referrer"/);
  assert.match(imageSource, /onError/);
  assert.match(imageSource, /图片加载失败/);
  assert.match(imageSource, /图片证据页/);
  assert.doesNotMatch(imageSource, /图片的原始来源/);
  assert.doesNotMatch(imageSource, /图片原始来源/);
  assert.match(pageSource, /1688 重复货源/);
  assert.match(pageSource, /链接拒绝/);
  assert.match(pageSource, /样本数 \/ 跟踪天数/);
  assert.doesNotMatch(pageSource, /1688 重复 offer/);
  assert.doesNotMatch(pageSource, /URL 拒绝/);
  assert.doesNotMatch(pageSource, /样本 \/ cohort 年龄/);
  assert.match(pageSource, /statusText\[status\] \?\? "状态待确认"/);
  assert.match(pageSource, /gateLabels\[reason\] \?\? "其他需复核门禁"/);
});

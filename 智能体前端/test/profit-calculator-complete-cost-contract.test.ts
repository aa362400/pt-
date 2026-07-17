import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pageSource = readFileSync(
  new URL('../src/pages/ProfitCalculator.tsx', import.meta.url),
  'utf8',
);
const apiSource = readFileSync(
  new URL('../src/api/profit-calculator.ts', import.meta.url),
  'utf8',
);

const requiredLabels = [
  '产品成本',
  '包装成本',
  '末端配送',
  '国内运输',
  '国际物流',
  '平台佣金',
  '支付手续费',
  '广告费用',
  '仓储费',
  '税费',
  '退款损耗预留',
  '汇率波动预留',
  '其他杂费',
];

test('profit UI distinguishes missing costs from explicit zero and collects the complete breakdown', () => {
  for (const label of requiredLabels) {
    assert.match(pageSource, new RegExp(label));
  }
  assert.match(pageSource, /Partial<Record<CostLabel, number>>/);
  assert.match(pageSource, /const missingCosts = costLabels\.filter/);
  assert.match(pageSource, /明确无费用时请输入 0/);
  assert.doesNotMatch(pageSource, /const initialCostValues:[\s\S]*?'产品成本': 0/);
});

test('profit API maps every required cost field and refuses an incomplete client payload', () => {
  for (const field of [
    'domesticTransportCost',
    'internationalLogisticsCost',
    'taxCost',
    'refundLossReserve',
    'exchangeRateRiskReserve',
  ]) {
    assert.match(apiSource, new RegExp(field));
  }
  assert.match(apiSource, /PROFIT_COST_DATA_INSUFFICIENT/);
  assert.doesNotMatch(apiSource, /productCost:\s*0,/);
});

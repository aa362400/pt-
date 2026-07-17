import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  dataAnalysisCurrencyLabel,
  dataAnalysisProductSourceLabel,
  dataAnalysisProductStatusLabel,
  dataAnalysisSourceLabel,
  dataAnalysisTrendLabel,
  dataAnalysisTrendSourceLabel,
} from '../src/utils/data-analysis-presentation.ts';

const pageSource = readFileSync(
  new URL('../src/pages-v2/DataAnalysisV2.tsx', import.meta.url),
  'utf8',
);

test('商品状态和来源代码转换为准确中文，未知值不会直接暴露', () => {
  assert.equal(dataAnalysisProductStatusLabel('VISIBLE', 'ACTIVE'), 'Ozon 可见');
  assert.equal(dataAnalysisProductStatusLabel(null, 'ACTIVE'), '在售');
  assert.equal(dataAnalysisProductStatusLabel('future_ozon_status', 'PAUSED'), '已暂停');
  assert.equal(dataAnalysisProductStatusLabel('future_ozon_status', 'future_status'), '状态未知');
  assert.equal(dataAnalysisProductStatusLabel(null, null), '状态未提供');

  assert.equal(dataAnalysisProductSourceLabel('ozon'), 'Ozon');
  assert.equal(dataAnalysisProductSourceLabel('product_table'), '商品目录');
  assert.equal(dataAnalysisProductSourceLabel('future_source'), '来源未知');
  assert.equal(dataAnalysisProductSourceLabel(null), '来源未提供');
});

test('趋势证据来源和数据集来源使用客户可读中文', () => {
  assert.equal(dataAnalysisTrendSourceLabel('trend_insight'), '趋势洞察');
  assert.equal(dataAnalysisTrendSourceLabel('keyword_report'), '关键词报告');
  assert.equal(dataAnalysisTrendSourceLabel('mixed'), '趋势洞察与关键词报告');
  assert.equal(dataAnalysisTrendSourceLabel('future_source'), '来源未知');
  assert.equal(dataAnalysisTrendSourceLabel(null), '来源未提供');

  assert.equal(dataAnalysisSourceLabel('profit_calculations'), '利润计算记录');
  assert.equal(dataAnalysisSourceLabel('products'), 'Ozon 商品同步目录');
  assert.equal(dataAnalysisSourceLabel('future_source'), '数据来源未知');
  assert.equal(dataAnalysisSourceLabel(null), '数据来源未提供');
});

test('真实英文趋势描述翻译为中文，未收录英文不会被伪译', () => {
  assert.equal(
    dataAnalysisTrendLabel('Key Trends Shaping Online Commerce in 2026 - Signifyd'),
    '塑造 2026 年在线商业的关键趋势',
  );
  assert.equal(
    dataAnalysisTrendLabel('Parking sensor (датчик парктроника) from Chinese supplier with export to Europe and US'),
    '中国供应商的倒车雷达传感器，出口欧洲和美国',
  );
  assert.equal(dataAnalysisTrendLabel('租户隔离'), '租户隔离');
  assert.equal(dataAnalysisTrendLabel('A new untranslated English trend'), '英文趋势描述待翻译');
  assert.equal(dataAnalysisTrendLabel(null), '趋势描述未提供');
});

test('币种代码和页面表格不再直接展示原始后端代码', () => {
  assert.equal(dataAnalysisCurrencyLabel('RUB'), '俄罗斯卢布');
  assert.equal(dataAnalysisCurrencyLabel('CNY'), '人民币');
  assert.equal(dataAnalysisCurrencyLabel('future_currency'), '币种未知');
  assert.equal(dataAnalysisCurrencyLabel(null), '币种未提供');

  assert.doesNotMatch(pageSource, /\{item\.ozonStatus \?\? item\.status\}/);
  assert.doesNotMatch(pageSource, /\{item\.source\}/);
  assert.match(pageSource, /dataAnalysisProductStatusLabel/);
  assert.match(pageSource, /dataAnalysisProductSourceLabel/);
  assert.match(pageSource, /dataAnalysisTrendLabel/);
});

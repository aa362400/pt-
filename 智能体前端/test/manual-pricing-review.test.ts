import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  emptyManualPricingForm,
  manualPricingFormFromDecisionEvidence,
  manualPricingPayload,
  validateManualPricingForm,
} from '../src/utils/manual-pricing-review.ts';

test('complete manual pricing fails closed until every cost and evidence field is present', () => {
  const errors = validateManualPricingForm(
    {
      ...emptyManualPricingForm(),
      currency: 'CNY',
      procurementCost: '12.5',
      domesticShippingCost: '1.2',
      notes: '等待国际物流报价。',
    },
    'SUBMIT_COMPLETE',
  );

  assert.equal(errors.internationalShippingCost, '请填写国际物流费用');
  assert.equal(errors.ozonCommissionRatePercent, '请填写 Ozon 佣金费率');
  assert.equal(errors.riskEvidence, '请填写至少 5 个字符的风险证据');
});

test('zero is a valid real value while invalid rates are blocked', () => {
  const values = {
    ...emptyManualPricingForm(),
    currency: 'CNY',
    procurementCost: '0',
    domesticShippingCost: '0',
    internationalShippingCost: '0',
    ozonCommissionRatePercent: '18',
    paymentCollectionFeeRatePercent: '2',
    warehousingCost: '0',
    advertisingRatePercent: '101',
    refundLossRatePercent: '0',
    taxRatePercent: '0',
    packagingCost: '0',
    fxBufferRatePercent: '0',
    notes: '已核对零费用项目。',
    riskEvidence: '报价与合同证据已人工核对。',
  };

  const errors = validateManualPricingForm(values, 'SUBMIT_COMPLETE');
  assert.equal(errors.procurementCost, undefined);
  assert.equal(errors.advertisingRatePercent, '请输入 0 到 100 之间的数值');
});

test('stored evidence repopulates the form and payload contains only numeric real inputs', () => {
  const form = manualPricingFormFromDecisionEvidence({
    manualPricingRequired: true,
    manualPricing: {
      state: 'DRAFT',
      currency: 'CNY',
      procurementCost: 12.5,
      advertisingRatePercent: 10,
      notes: '人工录入',
      riskEvidence: '报价单 Q-1',
    },
  });

  assert.equal(form.procurementCost, '12.5');
  assert.equal(form.advertisingRatePercent, '10');
  assert.equal(form.internationalShippingCost, '');
  assert.deepEqual(manualPricingPayload(form, 'SAVE_DRAFT'), {
    action: 'SAVE_DRAFT',
    currency: 'CNY',
    procurementCost: 12.5,
    advertisingRatePercent: 10,
    notes: '人工录入',
    riskEvidence: '报价单 Q-1',
  });
});

test('approval center exposes the Chinese manual pricing workspace and real save endpoint', () => {
  const component = readFileSync(
    new URL(
      '../src/components/review/ManualPricingReviewForm.tsx',
      import.meta.url,
    ),
    'utf8',
  );
  const page = readFileSync(
    new URL('../src/pages-v2/ApprovalCenterV2.tsx', import.meta.url),
    'utf8',
  );
  const api = readFileSync(
    new URL('../src/api/review.ts', import.meta.url),
    'utf8',
  );
  const formRules = readFileSync(
    new URL('../src/utils/manual-pricing-review.ts', import.meta.url),
    'utf8',
  );
  const customerUiSource = `${component}\n${formRules}`;

  for (const label of [
    '采购成本',
    '国内运输',
    '国际物流',
    'Ozon 佣金费率',
    '支付与回款费率',
    '仓储费用',
    '广告预算费率',
    '退款与损耗预留',
    '税费率',
    '包装费用',
    '汇率波动预留',
    '币种',
    '核价备注',
    '风险证据',
    '保存草稿',
    '仍需补充',
    '核价已补充',
  ]) {
    assert.match(customerUiSource, new RegExp(label));
  }
  assert.match(component, /不自动估价/);
  assert.match(component, /不触发 Ozon 发布/);
  assert.match(page, /<ManualPricingReviewForm/);
  assert.match(page, /reviewApi\.updateManualPricing/);
  assert.match(api, /patch<ReviewTask>\(`\/review\/\$\{id\}\/manual-pricing`/);
});

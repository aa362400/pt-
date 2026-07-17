import type {
  ManualPricingAction,
  ManualPricingUpdateInput,
} from '../api/review';

export const MANUAL_PRICING_FIELDS = [
  { key: 'procurementCost', label: '采购成本', unit: '金额', maximum: 1_000_000_000 },
  { key: 'domesticShippingCost', label: '国内运输', unit: '金额', maximum: 1_000_000_000 },
  { key: 'internationalShippingCost', label: '国际物流费用', unit: '金额', maximum: 1_000_000_000 },
  { key: 'ozonCommissionRatePercent', label: 'Ozon 佣金费率', unit: '%', maximum: 100 },
  { key: 'paymentCollectionFeeRatePercent', label: '支付与回款费率', unit: '%', maximum: 100 },
  { key: 'warehousingCost', label: '仓储费用', unit: '金额', maximum: 1_000_000_000 },
  { key: 'advertisingRatePercent', label: '广告预算费率', unit: '%', maximum: 100 },
  { key: 'refundLossRatePercent', label: '退款与损耗预留', unit: '%', maximum: 100 },
  { key: 'taxRatePercent', label: '税费率', unit: '%', maximum: 100 },
  { key: 'packagingCost', label: '包装费用', unit: '金额', maximum: 1_000_000_000 },
  { key: 'fxBufferRatePercent', label: '汇率波动预留', unit: '%', maximum: 100 },
] as const;

export type ManualPricingNumericField =
  (typeof MANUAL_PRICING_FIELDS)[number]['key'];

export type ManualPricingFormValues = Record<ManualPricingNumericField, string> & {
  currency: string;
  notes: string;
  riskEvidence: string;
};

export type ManualPricingFormErrors = Partial<
  Record<keyof ManualPricingFormValues, string>
>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function emptyManualPricingForm(): ManualPricingFormValues {
  return {
    currency: 'CNY',
    procurementCost: '',
    domesticShippingCost: '',
    internationalShippingCost: '',
    ozonCommissionRatePercent: '',
    paymentCollectionFeeRatePercent: '',
    warehousingCost: '',
    advertisingRatePercent: '',
    refundLossRatePercent: '',
    taxRatePercent: '',
    packagingCost: '',
    fxBufferRatePercent: '',
    notes: '',
    riskEvidence: '',
  };
}

export function manualPricingFormFromDecisionEvidence(
  decisionEvidence: unknown,
): ManualPricingFormValues {
  const form = emptyManualPricingForm();
  const evidence = asRecord(asRecord(decisionEvidence).manualPricing);
  const currency = evidence.currency;
  if (typeof currency === 'string' && /^[A-Z]{3}$/u.test(currency)) {
    form.currency = currency;
  }
  for (const field of MANUAL_PRICING_FIELDS) {
    const value = evidence[field.key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      form[field.key] = String(value);
    }
  }
  form.notes = typeof evidence.notes === 'string' ? evidence.notes : '';
  form.riskEvidence =
    typeof evidence.riskEvidence === 'string' ? evidence.riskEvidence : '';
  return form;
}

export function validateManualPricingForm(
  values: ManualPricingFormValues,
  action: ManualPricingAction,
): ManualPricingFormErrors {
  const errors: ManualPricingFormErrors = {};
  for (const field of MANUAL_PRICING_FIELDS) {
    const raw = values[field.key].trim();
    if (raw.length === 0) {
      if (action === 'SUBMIT_COMPLETE') {
        errors[field.key] = `请填写${/^[A-Za-z]/u.test(field.label) ? ' ' : ''}${field.label}`;
      }
      continue;
    }
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > field.maximum) {
      errors[field.key] = `请输入 0 到 ${field.maximum} 之间的数值`;
    }
  }

  const currency = values.currency.trim();
  if (action === 'SUBMIT_COMPLETE' && !/^[A-Z]{3}$/u.test(currency)) {
    errors.currency = '请选择币种';
  }
  if (
    action === 'SUBMIT_COMPLETE' &&
    values.notes.trim().length < 5
  ) {
    errors.notes = '请填写至少 5 个字符的核价备注';
  }
  if (
    action === 'SUBMIT_INCOMPLETE' &&
    values.notes.trim().length < 5
  ) {
    errors.notes = '请说明仍需补充的项目（至少 5 个字符）';
  }
  if (
    action === 'SUBMIT_COMPLETE' &&
    values.riskEvidence.trim().length < 5
  ) {
    errors.riskEvidence = '请填写至少 5 个字符的风险证据';
  }
  return errors;
}

export function manualPricingPayload(
  values: ManualPricingFormValues,
  action: ManualPricingAction,
): ManualPricingUpdateInput {
  const payload: ManualPricingUpdateInput = { action };
  const currency = values.currency.trim();
  if (currency) payload.currency = currency;
  for (const field of MANUAL_PRICING_FIELDS) {
    const raw = values[field.key].trim();
    if (!raw) continue;
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) payload[field.key] = numeric;
  }
  if (values.notes.trim()) payload.notes = values.notes.trim();
  if (values.riskEvidence.trim()) {
    payload.riskEvidence = values.riskEvidence.trim();
  }
  return payload;
}

export function manualPricingRecord(decisionEvidence: unknown) {
  return asRecord(asRecord(decisionEvidence).manualPricing);
}

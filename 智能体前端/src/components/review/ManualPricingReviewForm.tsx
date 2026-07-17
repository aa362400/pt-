import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Save } from 'lucide-react';
import type {
  ManualPricingAction,
  ManualPricingUpdateInput,
} from '../../api/review';
import {
  MANUAL_PRICING_FIELDS,
  manualPricingFormFromDecisionEvidence,
  manualPricingPayload,
  manualPricingRecord,
  validateManualPricingForm,
  type ManualPricingFormErrors,
  type ManualPricingFormValues,
} from '../../utils/manual-pricing-review';
import ManualPricingNumericFields from './ManualPricingNumericFields';

interface ManualPricingReviewFormProps {
  decisionEvidence: unknown;
  disabled?: boolean;
  onSubmit: (input: ManualPricingUpdateInput) => Promise<void>;
}
const STATE_LABELS: Record<string, string> = {
  DRAFT: '草稿已保存',
  COMPLETE: '核价已补充，等待后续风控复核',
  INCOMPLETE: '仍需补充',
};
function missingFieldLabel(key: string): string {
  if (key === 'currency') return '币种';
  if (key === 'notes') return '核价备注';
  if (key === 'riskEvidence') return '风险证据';
  return MANUAL_PRICING_FIELDS.find((field) => field.key === key)?.label ?? key;
}
export default function ManualPricingReviewForm({
  decisionEvidence,
  disabled = false,
  onSubmit,
}: ManualPricingReviewFormProps) {
  const [values, setValues] = useState<ManualPricingFormValues>(() =>
    manualPricingFormFromDecisionEvidence(decisionEvidence),
  );
  const [errors, setErrors] = useState<ManualPricingFormErrors>({});
  const [submittingAction, setSubmittingAction] =
    useState<ManualPricingAction | null>(null);
  const stored = useMemo(
    () => manualPricingRecord(decisionEvidence),
    [decisionEvidence],
  );
  const storedState =
    typeof stored.state === 'string' ? STATE_LABELS[stored.state] : null;
  const storedMissing = Array.isArray(stored.missingFields)
    ? stored.missingFields.filter((item): item is string => typeof item === 'string')
    : [];
  const busy = disabled || submittingAction !== null;

  const setField = (key: keyof ManualPricingFormValues, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };
  const submit = async (action: ManualPricingAction) => {
    const nextErrors = validateManualPricingForm(values, action);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSubmittingAction(action);
    try {
      await onSubmit(manualPricingPayload(values, action));
    } finally {
      setSubmittingAction(null);
    }
  };
  return (
    <section
      aria-labelledby="manual-pricing-title"
      className="space-y-5 rounded-lg border border-amber-200 bg-amber-50/50 p-5"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 id="manual-pricing-title" className="text-base font-semibold text-gray-900">
            人工核价与风险证据
          </h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-600">
            本区只记录人工确认的数据，不自动估价、不把任务改为通过，也不触发 Ozon 发布。
          </p>
        </div>
        {storedState ? (
          <div className="flex items-center gap-2 text-sm font-medium text-amber-800" aria-live="polite">
            {stored.state === 'COMPLETE' ? <CheckCircle2 size={16} /> : <Clock3 size={16} />}
            {storedState}
            {typeof stored.revision === 'number' ? ` · 第 ${stored.revision} 版` : ''}
          </div>
        ) : null}
      </div>

      {storedMissing.length > 0 ? (
        <div className="flex gap-2 rounded-lg border border-amber-200 bg-white p-3 text-sm leading-6 text-amber-900">
          <AlertTriangle className="mt-1 shrink-0" size={16} />
          <span>服务端判定仍缺：{storedMissing.map(missingFieldLabel).join('、')}</span>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor="manual-pricing-currency" className="mb-1 block text-sm font-medium text-gray-700">
            币种 <span className="text-red-600">*</span>
          </label>
          <select
            id="manual-pricing-currency"
            value={values.currency}
            disabled={busy}
            onChange={(event) => setField('currency', event.target.value)}
            aria-invalid={Boolean(errors.currency)}
            aria-describedby={errors.currency ? 'manual-pricing-currency-error' : undefined}
            className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm disabled:bg-gray-100"
          >
            <option value="CNY">人民币（CNY）</option>
            <option value="RUB">俄罗斯卢布（RUB）</option>
            <option value="USD">美元（USD）</option>
            <option value="EUR">欧元（EUR）</option>
          </select>
          {errors.currency ? <p id="manual-pricing-currency-error" className="mt-1 text-xs text-red-700">{errors.currency}</p> : null}
        </div>

        <ManualPricingNumericFields
          values={values}
          errors={errors}
          disabled={busy}
          onChange={setField}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label htmlFor="manual-pricing-notes" className="mb-1 block text-sm font-medium text-gray-700">核价备注</label>
          <textarea
            id="manual-pricing-notes"
            rows={4}
            maxLength={4000}
            value={values.notes}
            disabled={busy}
            onChange={(event) => setField('notes', event.target.value)}
            aria-invalid={Boolean(errors.notes)}
            aria-describedby={errors.notes ? 'manual-pricing-notes-error' : undefined}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-gray-100"
            placeholder="说明报价日期、数量区间、仍待确认的费用等"
          />
          {errors.notes ? <p id="manual-pricing-notes-error" className="mt-1 text-xs text-red-700">{errors.notes}</p> : null}
        </div>
        <div>
          <label htmlFor="manual-pricing-risk-evidence" className="mb-1 block text-sm font-medium text-gray-700">风险证据</label>
          <textarea
            id="manual-pricing-risk-evidence"
            rows={4}
            maxLength={4000}
            value={values.riskEvidence}
            disabled={busy}
            onChange={(event) => setField('riskEvidence', event.target.value)}
            aria-invalid={Boolean(errors.riskEvidence)}
            aria-describedby={errors.riskEvidence ? 'manual-pricing-risk-evidence-error' : undefined}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-gray-100"
            placeholder="填写报价单、合同、物流方案或风险核查记录编号，不要填写口令或密钥"
          />
          {errors.riskEvidence ? <p id="manual-pricing-risk-evidence-error" className="mt-1 text-xs text-red-700">{errors.riskEvidence}</p> : null}
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-amber-200 pt-4">
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit('SAVE_DRAFT')}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-40"
        >
          <Save size={15} />
          {submittingAction === 'SAVE_DRAFT' ? '正在保存...' : '保存草稿'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit('SUBMIT_INCOMPLETE')}
          className="rounded-lg border border-amber-400 bg-white px-4 py-2 text-sm font-medium text-amber-800 disabled:opacity-40"
        >
          {submittingAction === 'SUBMIT_INCOMPLETE' ? '正在提交...' : '仍需补充'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit('SUBMIT_COMPLETE')}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {submittingAction === 'SUBMIT_COMPLETE' ? '正在提交...' : '核价已补充'}
        </button>
      </div>
    </section>
  );
}

import {
  MANUAL_PRICING_FIELDS,
  type ManualPricingFormErrors,
  type ManualPricingFormValues,
  type ManualPricingNumericField,
} from '../../utils/manual-pricing-review';

interface ManualPricingNumericFieldsProps {
  values: ManualPricingFormValues;
  errors: ManualPricingFormErrors;
  disabled: boolean;
  onChange: (key: ManualPricingNumericField, value: string) => void;
}

export default function ManualPricingNumericFields({
  values,
  errors,
  disabled,
  onChange,
}: ManualPricingNumericFieldsProps) {
  return (
    <>
      {MANUAL_PRICING_FIELDS.map((field) => {
        const errorId = `manual-pricing-${field.key}-error`;
        return (
          <div key={field.key}>
            <label htmlFor={`manual-pricing-${field.key}`} className="mb-1 block text-sm font-medium text-gray-700">
              {field.label} <span className="text-gray-400">（{field.unit}）</span>
            </label>
            <input
              id={`manual-pricing-${field.key}`}
              type="number"
              inputMode="decimal"
              min="0"
              max={field.maximum}
              step="0.0001"
              value={values[field.key]}
              disabled={disabled}
              onChange={(event) => onChange(field.key, event.target.value)}
              aria-invalid={Boolean(errors[field.key])}
              aria-describedby={errors[field.key] ? errorId : undefined}
              className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm disabled:bg-gray-100"
              placeholder={field.unit === '%' ? '例如 18' : '填写真实金额'}
            />
            {errors[field.key] ? <p id={errorId} className="mt-1 text-xs text-red-700">{errors[field.key]}</p> : null}
          </div>
        );
      })}
    </>
  );
}

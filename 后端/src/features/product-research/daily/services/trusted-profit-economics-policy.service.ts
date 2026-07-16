import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { ProfitCalculationInput } from './profit-capacity.service.js';

const decimalSchema = z
  .string()
  .regex(/^\d+(?:\.\d+)?$/)
  .refine((value) => Number(value) > 0);
const rateSchema = z.string().regex(/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/);
const currencySchema = z.string().regex(/^[A-Z]{3}$/);
const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === 'https:');
const traceShape = {
  quality: z.enum(['VERIFIED', 'ESTIMATED', 'MANUAL']),
  provider: z.string().trim().min(1).max(120),
  evidenceUrl: httpsUrlSchema,
  observedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
};
const moneyEvidenceSchema = z
  .object({
    ...traceShape,
    amount: decimalSchema,
    currency: currencySchema,
  })
  .strict();
const feeRateEvidenceSchema = z
  .object({ ...traceShape, value: rateSchema })
  .strict();
const fxEvidenceSchema = z
  .object({
    ...traceShape,
    baseCurrency: currencySchema,
    quoteCurrency: currencySchema,
    rate: decimalSchema,
  })
  .strict();
const supplierCostSchema = z
  .object({
    ...traceShape,
    code: z.enum(['PRODUCT', 'SHIPPING']),
    amount: decimalSchema,
    currency: currencySchema,
    required: z.literal(true),
    evidenceId: z.string().regex(/^supplier_quote_snapshot:[a-f0-9]{64}$/),
    scope: z.literal('LANDED_RU').optional(),
  })
  .strict();

type TraceableEvidence = {
  quality: 'VERIFIED' | 'ESTIMATED' | 'MANUAL';
  provider: string;
  evidenceUrl: string;
  observedAt: string;
  expiresAt: string;
};

@Injectable()
export class TrustedProfitEconomicsPolicyService {
  deriveCalculationInput(input: {
    evidence: unknown;
    rawCandidateCosts?: unknown[];
    targetCurrency: string;
    now?: Date;
    maxEvidenceAgeSeconds: number;
  }): {
    calculationInput: ProfitCalculationInput | null;
    hardGateReasons: string[];
  } {
    const reasons: string[] = [];
    const now = input.now ?? new Date();
    const evidence = this.record(input.evidence);

    if ((input.rawCandidateCosts ?? []).length > 0) {
      reasons.push('RAW_CANDIDATE_COSTS_FORBIDDEN');
    }
    if (!currencySchema.safeParse(input.targetCurrency).success) {
      reasons.push('TARGET_CURRENCY_INVALID');
    }

    const saleResult = moneyEvidenceSchema.safeParse(evidence.salePrice);
    if (!saleResult.success) {
      reasons.push(
        evidence.salePrice === null || evidence.salePrice === undefined
          ? 'SALE_PRICE_EVIDENCE_MISSING'
          : 'SALE_PRICE_EVIDENCE_INVALID',
      );
    } else {
      this.validateTrace(
        saleResult.data,
        now,
        input.maxEvidenceAgeSeconds,
        'SALE_PRICE',
        reasons,
      );
      if (saleResult.data.currency !== input.targetCurrency) {
        reasons.push('SALE_PRICE_CURRENCY_MISMATCH');
      }
    }

    const supplierResult = z
      .array(supplierCostSchema)
      .min(2)
      .max(20)
      .safeParse(evidence.supplierCosts);
    if (!supplierResult.success) {
      reasons.push(
        evidence.supplierCosts === null || evidence.supplierCosts === undefined
          ? 'SUPPLIER_COST_EVIDENCE_MISSING'
          : 'SUPPLIER_COST_EVIDENCE_INVALID',
      );
    } else {
      const codes = supplierResult.data.map((cost) => cost.code);
      if (
        codes.filter((code) => code === 'PRODUCT').length !== 1 ||
        codes.filter((code) => code === 'SHIPPING').length !== 1
      ) {
        reasons.push('SUPPLIER_REQUIRED_COST_SET_INVALID');
      }
      const currencies = new Set(
        supplierResult.data.map((cost) => cost.currency),
      );
      if (currencies.size !== 1) {
        reasons.push('SUPPLIER_COST_CURRENCY_MISMATCH');
      }
      for (const cost of supplierResult.data) {
        this.validateTrace(
          cost,
          now,
          input.maxEvidenceAgeSeconds,
          'SUPPLIER_COST',
          reasons,
        );
        if (cost.code === 'SHIPPING' && cost.scope !== 'LANDED_RU') {
          reasons.push('SUPPLIER_LANDED_RU_SHIPPING_REQUIRED');
        }
      }
    }

    const rateEvidence = this.record(evidence.rates);
    const rateDefinitions = [
      ['platformFeeRate', 'PLATFORM_FEE_RATE'],
      ['paymentFeeRate', 'PAYMENT_FEE_RATE'],
      ['adRate', 'AD_RATE'],
      ['refundRate', 'REFUND_RATE'],
    ] as const;
    const parsedRates = new Map<
      (typeof rateDefinitions)[number][0],
      z.infer<typeof feeRateEvidenceSchema>
    >();
    for (const [field, reasonPrefix] of rateDefinitions) {
      const rawRate = rateEvidence[field];
      if (rawRate === null || rawRate === undefined) {
        reasons.push(`${reasonPrefix}_EVIDENCE_MISSING`);
        continue;
      }
      const parsed = feeRateEvidenceSchema.safeParse(rawRate);
      if (!parsed.success) {
        reasons.push(`${reasonPrefix}_EVIDENCE_INVALID`);
        continue;
      }
      parsedRates.set(field, parsed.data);
      this.validateTrace(
        parsed.data,
        now,
        input.maxEvidenceAgeSeconds,
        reasonPrefix,
        reasons,
      );
    }

    let fx: z.infer<typeof fxEvidenceSchema> | null = null;
    const supplierCurrency = supplierResult.success
      ? supplierResult.data[0]?.currency
      : undefined;
    if (supplierCurrency && supplierCurrency !== input.targetCurrency) {
      if (
        evidence.exchangeRate === null ||
        evidence.exchangeRate === undefined
      ) {
        reasons.push('CURRENCY_CONVERSION_MISSING');
      } else {
        const fxResult = fxEvidenceSchema.safeParse(evidence.exchangeRate);
        if (!fxResult.success) {
          reasons.push('CURRENCY_CONVERSION_EVIDENCE_INVALID');
        } else {
          fx = fxResult.data;
          if (fx.quality !== 'VERIFIED') {
            reasons.push('CURRENCY_CONVERSION_VERIFICATION_REQUIRED');
          }
          if (!this.isFresh(fx, now, input.maxEvidenceAgeSeconds)) {
            reasons.push('CURRENCY_CONVERSION_STALE');
          }
          if (
            fx.baseCurrency !== supplierCurrency ||
            fx.quoteCurrency !== input.targetCurrency
          ) {
            reasons.push('CURRENCY_CONVERSION_PAIR_MISMATCH');
          }
        }
      }
    }

    const hardGateReasons = [...new Set(reasons)];
    if (
      hardGateReasons.length > 0 ||
      !saleResult.success ||
      !supplierResult.success ||
      parsedRates.size !== rateDefinitions.length
    ) {
      return { calculationInput: null, hardGateReasons };
    }

    const costs = supplierResult.data.map((cost) => ({
      code: cost.code,
      amount:
        cost.currency === input.targetCurrency
          ? this.money(cost.amount)
          : this.multiplyMoney(cost.amount, fx!.rate),
      required: true,
    }));
    return {
      hardGateReasons: [],
      calculationInput: {
        currency: input.targetCurrency,
        salePrice: this.money(saleResult.data.amount),
        costs,
        platformFeeRate: parsedRates.get('platformFeeRate')!.value,
        paymentFeeRate: parsedRates.get('paymentFeeRate')!.value,
        adRate: parsedRates.get('adRate')!.value,
        refundRate: parsedRates.get('refundRate')!.value,
      },
    };
  }

  private validateTrace(
    evidence: TraceableEvidence,
    now: Date,
    maxEvidenceAgeSeconds: number,
    reasonPrefix: string,
    reasons: string[],
  ) {
    if (evidence.quality !== 'VERIFIED') {
      reasons.push(`${reasonPrefix}_VERIFICATION_REQUIRED`);
    }
    if (!this.isFresh(evidence, now, maxEvidenceAgeSeconds)) {
      reasons.push(`${reasonPrefix}_STALE`);
    }
  }

  private isFresh(
    evidence: Pick<TraceableEvidence, 'observedAt' | 'expiresAt'>,
    now: Date,
    maxEvidenceAgeSeconds: number,
  ): boolean {
    const observedAt = new Date(evidence.observedAt).getTime();
    const expiresAt = new Date(evidence.expiresAt).getTime();
    const nowMs = now.getTime();
    return (
      Number.isFinite(observedAt) &&
      Number.isFinite(expiresAt) &&
      observedAt <= nowMs &&
      expiresAt > nowMs &&
      expiresAt > observedAt &&
      nowMs - observedAt <= maxEvidenceAgeSeconds * 1000
    );
  }

  private multiplyMoney(amount: string, rate: string): string {
    const left = this.decimalParts(amount);
    const right = this.decimalParts(rate);
    const numerator = left.value * right.value * 100n;
    const denominator = left.scale * right.scale;
    const cents = (numerator + denominator / 2n) / denominator;
    return this.cents(cents);
  }

  private money(amount: string): string {
    const parsed = this.decimalParts(amount);
    const numerator = parsed.value * 100n;
    const cents = (numerator + parsed.scale / 2n) / parsed.scale;
    return this.cents(cents);
  }

  private cents(value: bigint): string {
    return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`;
  }

  private decimalParts(value: string): { value: bigint; scale: bigint } {
    const [whole, fraction = ''] = value.split('.');
    return {
      value: BigInt(`${whole}${fraction}`),
      scale: 10n ** BigInt(fraction.length),
    };
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}

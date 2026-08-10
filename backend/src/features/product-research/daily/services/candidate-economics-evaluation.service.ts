import { createHash } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import type {
  CandidateEconomicsEvidence,
  SupplierQuoteEvidence,
} from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { TenantDatabaseContextService } from '../../../../shared/database/tenant-database-context.service.js';
import {
  CANDIDATE_ECONOMICS_CALCULATOR_VERSION,
  CANDIDATE_ECONOMICS_EVALUATION_SCHEMA_VERSION,
  CANDIDATE_ECONOMICS_POLICY_VERSION,
  DEFAULT_CANDIDATE_ECONOMICS_POLICY,
  candidateEconomicsBindingSchema,
  candidateEconomicsPolicySchema,
  type CandidateEconomicsPolicy,
} from '../contracts/trusted-economics.contract.js';

const MONEY_SCALE = 10_000n;
const RATE_SCALE = 100_000_000n;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const REQUIRED_EVIDENCE = Object.freeze({
  SALE_PRICE: 'MONEY',
  DOMESTIC_TRANSPORT: 'MONEY',
  PACKAGING: 'MONEY',
  OZON_COMMISSION: 'RATE',
  OZON_PAYMENT: 'RATE_WITH_MINIMUM',
  OZON_FULFILLMENT: 'MONEY',
  OZON_STORAGE: 'MONEY',
  ADVERTISING: 'RATE',
  REFUND_LOSS: 'RATE',
  TAX: 'RATE',
  FX_VOLATILITY_RESERVE: 'RATE',
} as const);

type RequiredEvidenceKind = keyof typeof REQUIRED_EVIDENCE;

export interface EvaluateCandidateEconomicsInput {
  organizationId: string;
  workspaceId: string | null;
  researchRunId: string;
  candidateId: string;
  supplierQuoteEvidenceId?: string | null;
  economicsEvidenceIds: string[];
  policy?: CandidateEconomicsPolicy;
  now?: Date;
}

interface CalculationOutput {
  currency: string | null;
  salePrice: string | null;
  grossProfitBeforeAds: string | null;
  grossMarginBeforeAds: string | null;
  netProfitAfterAds: string | null;
  netMarginAfterAds: string | null;
  totalCost: string | null;
  componentBreakdown: Record<string, unknown>;
  thresholdReasons: string[];
}

@Injectable()
export class CandidateEconomicsEvaluationService {
  constructor(private readonly tenantDatabase: TenantDatabaseContextService) {}

  async evaluate(rawInput: EvaluateCandidateEconomicsInput) {
    const input = {
      ...rawInput,
      economicsEvidenceIds: [
        ...new Set(rawInput.economicsEvidenceIds.map((id) => id.trim())),
      ]
        .filter(Boolean)
        .sort((left, right) => this.compare(left, right)),
      policy: candidateEconomicsPolicySchema.parse(
        rawInput.policy ?? DEFAULT_CANDIDATE_ECONOMICS_POLICY,
      ),
      now: rawInput.now ?? new Date(),
    };
    const workspaceScopeKey = this.workspaceScopeKey(input.workspaceId);
    const policySnapshot = {
      ...input.policy,
      requiredEvidenceKinds: Object.keys(REQUIRED_EVIDENCE).sort(
        (left, right) => this.compare(left, right),
      ),
    };
    const policyHash = this.sha256(this.canonicalJson(policySnapshot));

    return this.tenantDatabase.run(input.organizationId, async (tx) => {
      const [candidate, supplierQuote, evidenceRows] = await Promise.all([
        tx.productCandidate.findFirst({
          where: {
            id: input.candidateId,
            organizationId: input.organizationId,
            researchRunId: input.researchRunId,
            workspaceId: input.workspaceId,
          },
          select: { id: true, fingerprint: true },
        }),
        input.supplierQuoteEvidenceId
          ? tx.supplierQuoteEvidence.findFirst({
              where: {
                id: input.supplierQuoteEvidenceId,
                organizationId: input.organizationId,
                workspaceId: input.workspaceId,
                researchRunId: input.researchRunId,
                candidateId: input.candidateId,
              },
            })
          : Promise.resolve(null),
        input.economicsEvidenceIds.length
          ? tx.candidateEconomicsEvidence.findMany({
              where: {
                id: { in: input.economicsEvidenceIds },
                organizationId: input.organizationId,
                workspaceId: input.workspaceId,
                researchRunId: input.researchRunId,
                candidateId: input.candidateId,
              },
              orderBy: [{ kind: 'asc' }, { id: 'asc' }],
            })
          : Promise.resolve([]),
      ]);
      if (!candidate) {
        throw new ConflictException(
          'CANDIDATE_ECONOMICS_EVALUATION_PARENT_MISMATCH',
        );
      }

      const reasons: string[] = [];
      if (
        input.supplierQuoteEvidenceId &&
        supplierQuote?.id !== input.supplierQuoteEvidenceId
      ) {
        reasons.push('SUPPLIER_QUOTE_EVIDENCE_BINDING_MISMATCH');
      }
      if (evidenceRows.length !== input.economicsEvidenceIds.length) {
        reasons.push('ECONOMICS_EVIDENCE_BINDING_MISMATCH');
      }
      this.validateSupplierQuote(supplierQuote, input, reasons);
      for (const evidence of evidenceRows) {
        this.validateEvidence(evidence, candidate.fingerprint, input, reasons);
      }

      const evidenceByKind = new Map<string, CandidateEconomicsEvidence[]>();
      for (const row of evidenceRows) {
        const values = evidenceByKind.get(row.kind) ?? [];
        values.push(row);
        evidenceByKind.set(row.kind, values);
      }
      for (const [kind, expectedValueKind] of Object.entries(
        REQUIRED_EVIDENCE,
      )) {
        const matches = evidenceByKind.get(kind) ?? [];
        if (matches.length === 0) {
          reasons.push(`${kind}_EVIDENCE_MISSING`);
        } else if (matches.length !== 1) {
          reasons.push(`${kind}_EVIDENCE_CARDINALITY_INVALID`);
        } else if (matches[0]!.valueKind !== expectedValueKind) {
          reasons.push(`${kind}_VALUE_KIND_INVALID`);
        }
      }

      const sale = this.single(evidenceByKind, 'SALE_PRICE');
      const targetCurrency = sale?.currency ?? null;
      const requiresFx =
        supplierQuote !== null &&
        targetCurrency !== null &&
        (supplierQuote.productCurrency !== targetCurrency ||
          supplierQuote.shippingCurrency !== targetCurrency);
      const fxRows = evidenceByKind.get('FX_RATE') ?? [];
      if (requiresFx && fxRows.length === 0) {
        reasons.push('FX_RATE_EVIDENCE_MISSING');
      } else if (requiresFx && fxRows.length !== 1) {
        reasons.push('FX_RATE_EVIDENCE_CARDINALITY_INVALID');
      } else if (requiresFx && fxRows[0]?.valueKind !== 'FX') {
        reasons.push('FX_RATE_VALUE_KIND_INVALID');
      }
      if (!requiresFx && fxRows.length > 1) {
        reasons.push('FX_RATE_EVIDENCE_CARDINALITY_INVALID');
      }

      const freshnessDates = [
        ...evidenceRows.map((row) =>
          this.effectiveValidUntil(
            row.observedAt,
            row.validUntil,
            input.policy.maxEvidenceAgeSeconds,
          ),
        ),
        ...(supplierQuote
          ? [
              this.effectiveValidUntil(
                supplierQuote.fetchedAt,
                supplierQuote.validUntil,
                input.policy.maxEvidenceAgeSeconds,
              ),
            ]
          : []),
      ];
      const validUntil = freshnessDates.length
        ? new Date(Math.min(...freshnessDates.map((date) => date.getTime())))
        : input.now;
      if (validUntil.getTime() <= input.now.getTime()) {
        reasons.push('ECONOMICS_EVIDENCE_STALE');
      }

      const uniqueReasons = [...new Set(reasons)].sort((left, right) =>
        this.compare(left, right),
      );
      const calculation =
        uniqueReasons.length === 0 && supplierQuote && sale
          ? this.calculate(
              supplierQuote,
              evidenceByKind,
              targetCurrency!,
              input.policy,
            )
          : this.emptyCalculation(targetCurrency);
      const hardGateReasons = [
        ...new Set([...uniqueReasons, ...calculation.thresholdReasons]),
      ].sort((left, right) => this.compare(left, right));
      const hasMissingOrInvalidEvidence = uniqueReasons.length > 0;
      const status = hasMissingOrInvalidEvidence ? 'BLOCKED' : 'VERIFIED';
      const decision = hasMissingOrInvalidEvidence
        ? 'DATA_INSUFFICIENT'
        : calculation.thresholdReasons.length > 0
          ? 'REJECT'
          : 'PASS';

      const sortedInputs = evidenceRows.map((row) => ({
        role: row.kind,
        evidenceId: row.id,
        contentHash: row.contentHash,
        rawSnapshotSha256: row.rawSnapshotSha256,
      }));
      const inputSetHash = this.sha256(
        this.canonicalJson({
          organizationId: input.organizationId,
          workspaceScopeKey,
          researchRunId: input.researchRunId,
          candidateId: input.candidateId,
          candidateFingerprint: candidate.fingerprint,
          policyHash,
          calculatorVersion: CANDIDATE_ECONOMICS_CALCULATOR_VERSION,
          supplierQuote: supplierQuote
            ? {
                id: supplierQuote.id,
                contentHash: supplierQuote.contentHash,
                rawSnapshotSha256: supplierQuote.rawSnapshotSha256,
              }
            : null,
          evidence: sortedInputs,
        }),
      );
      const rawSnapshotSetHash = this.sha256(
        this.canonicalJson(
          [
            ...(supplierQuote ? [supplierQuote.rawSnapshotSha256] : []),
            ...evidenceRows.map((row) => row.rawSnapshotSha256),
          ].sort((left, right) => this.compare(left, right)),
        ),
      );
      const content = {
        schemaVersion: CANDIDATE_ECONOMICS_EVALUATION_SCHEMA_VERSION,
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        workspaceScopeKey,
        researchRunId: input.researchRunId,
        candidateId: input.candidateId,
        candidateFingerprint: candidate.fingerprint,
        supplierQuoteEvidenceId: supplierQuote?.id ?? null,
        policyVersion: CANDIDATE_ECONOMICS_POLICY_VERSION,
        calculatorVersion: CANDIDATE_ECONOMICS_CALCULATOR_VERSION,
        policySnapshot,
        policyHash,
        inputSetHash,
        rawSnapshotSetHash,
        status,
        decision,
        ...calculation,
        hardGateReasons,
        validFrom: input.now.toISOString(),
        validUntil: validUntil.toISOString(),
      };
      const contentHash = this.sha256(this.canonicalJson(content));
      const dedupeKey = this.sha256(
        [
          CANDIDATE_ECONOMICS_EVALUATION_SCHEMA_VERSION,
          workspaceScopeKey,
          input.candidateId,
          CANDIDATE_ECONOMICS_POLICY_VERSION,
          inputSetHash,
        ].join('|'),
      );

      const inserted = await tx.candidateEconomicsEvaluation.createMany({
        data: [
          {
            organizationId: input.organizationId,
            workspaceId: input.workspaceId,
            workspaceScopeKey,
            researchRunId: input.researchRunId,
            candidateId: input.candidateId,
            supplierQuoteEvidenceId: supplierQuote?.id ?? null,
            schemaVersion: CANDIDATE_ECONOMICS_EVALUATION_SCHEMA_VERSION,
            policyVersion: CANDIDATE_ECONOMICS_POLICY_VERSION,
            calculatorVersion: CANDIDATE_ECONOMICS_CALCULATOR_VERSION,
            policySnapshot,
            policyHash,
            inputSetHash,
            rawSnapshotSetHash,
            contentHash,
            dedupeKey,
            status,
            decision,
            currency: calculation.currency ?? targetCurrency ?? 'RUB',
            salePrice: calculation.salePrice,
            grossProfitBeforeAds: calculation.grossProfitBeforeAds,
            grossMarginBeforeAds: calculation.grossMarginBeforeAds,
            netProfitAfterAds: calculation.netProfitAfterAds,
            netMarginAfterAds: calculation.netMarginAfterAds,
            totalCost: calculation.totalCost,
            componentBreakdown:
              calculation.componentBreakdown as Prisma.InputJsonValue,
            hardGateReasons,
            validFrom: input.now,
            validUntil,
          },
        ],
        skipDuplicates: true,
      });
      const stored = await tx.candidateEconomicsEvaluation.findFirst({
        where: {
          organizationId: input.organizationId,
          workspaceScopeKey,
          candidateId: input.candidateId,
          policyVersion: CANDIDATE_ECONOMICS_POLICY_VERSION,
          inputSetHash,
        },
      });
      if (!stored) {
        throw new ConflictException(
          'CANDIDATE_ECONOMICS_EVALUATION_APPEND_FAILED',
        );
      }
      if (stored.contentHash !== contentHash) {
        throw new ConflictException(
          'CANDIDATE_ECONOMICS_EVALUATION_NONDETERMINISTIC',
        );
      }
      if (inserted.count === 1 && sortedInputs.length > 0) {
        await tx.candidateEconomicsEvaluationInput.createMany({
          data: sortedInputs.map((row, ordinal) => ({
            organizationId: input.organizationId,
            workspaceId: input.workspaceId,
            workspaceScopeKey,
            researchRunId: input.researchRunId,
            candidateId: input.candidateId,
            evaluationId: stored.id,
            economicsEvidenceId: row.evidenceId,
            role: row.role,
            ordinal,
            evidenceContentHash: row.contentHash,
            rawSnapshotSha256: row.rawSnapshotSha256,
          })),
          skipDuplicates: true,
        });
      }
      const inputCount = await tx.candidateEconomicsEvaluationInput.count({
        where: { evaluationId: stored.id },
      });
      if (inputCount !== sortedInputs.length) {
        throw new ConflictException(
          'CANDIDATE_ECONOMICS_EVALUATION_INPUT_SET_MISMATCH',
        );
      }
      return { ...stored, inserted: inserted.count === 1 };
    });
  }

  private validateSupplierQuote(
    quote: SupplierQuoteEvidence | null,
    input: EvaluateCandidateEconomicsInput & {
      policy: CandidateEconomicsPolicy;
      now: Date;
    },
    reasons: string[],
  ): void {
    if (!quote) {
      reasons.push('SUPPLIER_QUOTE_EVIDENCE_MISSING');
      return;
    }
    if (
      quote.verificationStatus !== 'VERIFIED' ||
      quote.priceKind !== 'EXACT' ||
      !this.positive(quote.productTotalAmount) ||
      !this.positive(quote.shippingTotalAmount) ||
      quote.shippingScope !== 'LANDED_RU'
    ) {
      reasons.push('SUPPLIER_QUOTE_EVIDENCE_INVALID');
    }
    const expectedRawRef = `supplier-quotes/${input.organizationId}/raw/${quote.rawSnapshotSha256}`;
    if (
      !HASH_PATTERN.test(quote.contentHash) ||
      !HASH_PATTERN.test(quote.rawSnapshotSha256) ||
      quote.rawSnapshotRef !== expectedRawRef
    ) {
      reasons.push('SUPPLIER_QUOTE_INTEGRITY_INVALID');
    }
    if (
      !this.fresh(quote.fetchedAt, quote.validUntil, input.now, input.policy)
    ) {
      reasons.push('SUPPLIER_QUOTE_EVIDENCE_STALE');
    }
  }

  private validateEvidence(
    evidence: CandidateEconomicsEvidence,
    candidateFingerprint: string,
    input: EvaluateCandidateEconomicsInput & {
      policy: CandidateEconomicsPolicy;
      now: Date;
    },
    reasons: string[],
  ): void {
    if (evidence.verificationStatus !== 'VERIFIED') {
      reasons.push(`${evidence.kind}_VERIFICATION_REQUIRED`);
    }
    const binding = candidateEconomicsBindingSchema.safeParse(evidence.binding);
    if (
      !binding.success ||
      binding.data.candidateFingerprint !== candidateFingerprint ||
      this.sha256(this.canonicalJson(binding.data)) !== evidence.bindingHash
    ) {
      reasons.push(`${evidence.kind}_BINDING_INVALID`);
    }
    const expectedRawRef = `economics-evidence/${input.organizationId}/raw/${evidence.rawSnapshotSha256}`;
    if (
      !HASH_PATTERN.test(evidence.rawSnapshotSha256) ||
      !HASH_PATTERN.test(evidence.contentHash) ||
      evidence.rawSnapshotRef !== expectedRawRef ||
      this.sha256(this.canonicalJson(evidence.normalizedEvidence)) !==
        evidence.contentHash
    ) {
      reasons.push(`${evidence.kind}_INTEGRITY_INVALID`);
    }
    if (
      !this.fresh(
        evidence.observedAt,
        evidence.validUntil,
        input.now,
        input.policy,
      )
    ) {
      reasons.push(`${evidence.kind}_EVIDENCE_STALE`);
    }
  }

  private calculate(
    quote: SupplierQuoteEvidence,
    evidenceByKind: Map<string, CandidateEconomicsEvidence[]>,
    targetCurrency: string,
    policy: CandidateEconomicsPolicy,
  ): CalculationOutput {
    const sale = this.money(this.singleRequired(evidenceByKind, 'SALE_PRICE'));
    const fx = this.single(evidenceByKind, 'FX_RATE');
    const convert = (amount: unknown, currency: string): bigint => {
      const money = this.parseScaled(String(amount), MONEY_SCALE, 'money');
      if (currency === targetCurrency) return money;
      if (
        !fx ||
        fx.valueKind !== 'FX' ||
        fx.baseCurrency !== currency ||
        fx.quoteCurrency !== targetCurrency ||
        fx.rate === null
      ) {
        throw new ConflictException('FX_RATE_PAIR_INVALID');
      }
      return this.multiplyScaled(
        money,
        this.parseScaled(String(fx.rate), RATE_SCALE, 'fxRate'),
        RATE_SCALE,
      );
    };
    const product = convert(quote.productTotalAmount!, quote.productCurrency);
    const internationalLogistics = convert(
      quote.shippingTotalAmount,
      quote.shippingCurrency,
    );
    const domesticTransport = this.money(
      this.singleRequired(evidenceByKind, 'DOMESTIC_TRANSPORT'),
      targetCurrency,
    );
    const packaging = this.money(
      this.singleRequired(evidenceByKind, 'PACKAGING'),
      targetCurrency,
    );
    const fulfillment = this.money(
      this.singleRequired(evidenceByKind, 'OZON_FULFILLMENT'),
      targetCurrency,
    );
    const storage = this.money(
      this.singleRequired(evidenceByKind, 'OZON_STORAGE'),
      targetCurrency,
    );
    const commission = this.rateAmount(
      sale,
      this.singleRequired(evidenceByKind, 'OZON_COMMISSION'),
    );
    const paymentEvidence = this.singleRequired(evidenceByKind, 'OZON_PAYMENT');
    const paymentRateAmount = this.rateAmount(sale, paymentEvidence);
    const paymentMinimum = this.money(paymentEvidence, targetCurrency, true);
    const payment =
      paymentRateAmount > paymentMinimum ? paymentRateAmount : paymentMinimum;
    const advertising = this.rateAmount(
      sale,
      this.singleRequired(evidenceByKind, 'ADVERTISING'),
    );
    const refundLoss = this.rateAmount(
      sale,
      this.singleRequired(evidenceByKind, 'REFUND_LOSS'),
    );
    const tax = this.rateAmount(
      sale,
      this.singleRequired(evidenceByKind, 'TAX'),
    );
    const fxReserveEvidence = this.singleRequired(
      evidenceByKind,
      'FX_VOLATILITY_RESERVE',
    );
    const fxReserve = this.rateAmount(
      product + internationalLogistics,
      fxReserveEvidence,
    );
    const beforeAdsCost =
      product +
      domesticTransport +
      internationalLogistics +
      packaging +
      commission +
      payment +
      fulfillment +
      storage +
      tax +
      fxReserve;
    const grossProfit = sale - beforeAdsCost;
    const totalCost = beforeAdsCost + advertising + refundLoss;
    const netProfit = sale - totalCost;
    const grossMargin = this.divideRate(grossProfit, sale);
    const netMargin = this.divideRate(netProfit, sale);
    const thresholdReasons: string[] = [];
    if (
      grossMargin <
      this.parseScaled(
        policy.minimumGrossMarginBeforeAds,
        RATE_SCALE,
        'minimumGrossMarginBeforeAds',
      )
    ) {
      thresholdReasons.push('GROSS_MARGIN_BELOW_POLICY');
    }
    if (
      netMargin <
      this.parseScaled(
        policy.minimumNetMarginAfterAds,
        RATE_SCALE,
        'minimumNetMarginAfterAds',
      )
    ) {
      thresholdReasons.push('NET_MARGIN_BELOW_POLICY');
    }
    if (netProfit <= 0n) thresholdReasons.push('NON_POSITIVE_NET_PROFIT');

    return {
      currency: targetCurrency,
      salePrice: this.formatScaled(sale, MONEY_SCALE, 4),
      grossProfitBeforeAds: this.formatScaled(grossProfit, MONEY_SCALE, 4),
      grossMarginBeforeAds: this.formatScaled(grossMargin, RATE_SCALE, 8),
      netProfitAfterAds: this.formatScaled(netProfit, MONEY_SCALE, 4),
      netMarginAfterAds: this.formatScaled(netMargin, RATE_SCALE, 8),
      totalCost: this.formatScaled(totalCost, MONEY_SCALE, 4),
      componentBreakdown: {
        procurement: this.component(product, 'SUPPLIER_QUOTE_EXACT'),
        domesticTransport: this.component(domesticTransport, 'EVIDENCE'),
        internationalLogistics: this.component(
          internationalLogistics,
          'SUPPLIER_QUOTE_LANDED_RU',
        ),
        packaging: this.component(packaging, 'EVIDENCE'),
        ozonCommission: this.component(commission, 'EVIDENCE'),
        payment: this.component(payment, 'RATE_WITH_MINIMUM'),
        fulfillment: this.component(fulfillment, 'EVIDENCE'),
        storage: this.component(storage, 'EVIDENCE'),
        tax: this.component(tax, 'EVIDENCE'),
        advertising: this.component(advertising, 'EVIDENCE'),
        refundLoss: this.component(refundLoss, 'EVIDENCE'),
        fxVolatilityReserve: this.component(fxReserve, 'EVIDENCE'),
        customsVatClearanceDestinationDelivery: {
          amount: '0.0000',
          currency: targetCurrency,
          treatment: 'INCLUDED_BY_SUPPLIER_LANDED_RU',
        },
      },
      thresholdReasons,
    };
  }

  private emptyCalculation(currency: string | null): CalculationOutput {
    return {
      currency,
      salePrice: null,
      grossProfitBeforeAds: null,
      grossMarginBeforeAds: null,
      netProfitAfterAds: null,
      netMarginAfterAds: null,
      totalCost: null,
      componentBreakdown: {},
      thresholdReasons: [],
    };
  }

  private component(value: bigint, source: string) {
    return {
      amount: this.formatScaled(value, MONEY_SCALE, 4),
      source,
    };
  }

  private single(
    values: Map<string, CandidateEconomicsEvidence[]>,
    kind: string,
  ): CandidateEconomicsEvidence | null {
    const matches = values.get(kind) ?? [];
    return matches.length === 1 ? matches[0]! : null;
  }

  private singleRequired(
    values: Map<string, CandidateEconomicsEvidence[]>,
    kind: RequiredEvidenceKind,
  ): CandidateEconomicsEvidence {
    const value = this.single(values, kind);
    if (!value) throw new ConflictException(`${kind}_EVIDENCE_REQUIRED`);
    return value;
  }

  private money(
    evidence: CandidateEconomicsEvidence,
    expectedCurrency?: string,
    minimum = false,
  ): bigint {
    const value = minimum ? evidence.minimumAmount : evidence.amount;
    if (
      value === null ||
      (expectedCurrency && evidence.currency !== expectedCurrency)
    ) {
      throw new ConflictException(`${evidence.kind}_MONEY_INVALID`);
    }
    return this.parseScaled(String(value), MONEY_SCALE, evidence.kind);
  }

  private rateAmount(
    amount: bigint,
    evidence: CandidateEconomicsEvidence,
  ): bigint {
    if (evidence.rate === null) {
      throw new ConflictException(`${evidence.kind}_RATE_INVALID`);
    }
    const rate = this.parseScaled(
      String(evidence.rate),
      RATE_SCALE,
      evidence.kind,
    );
    if (rate < 0n || rate > RATE_SCALE) {
      throw new ConflictException(`${evidence.kind}_RATE_INVALID`);
    }
    return this.multiplyScaled(amount, rate, RATE_SCALE);
  }

  private positive(value: unknown): boolean {
    return value !== null && Number(value) > 0;
  }

  private fresh(
    observedAt: Date,
    validUntil: Date,
    now: Date,
    policy: CandidateEconomicsPolicy,
  ): boolean {
    return (
      observedAt.getTime() <= now.getTime() &&
      validUntil.getTime() > now.getTime() &&
      now.getTime() - observedAt.getTime() <=
        policy.maxEvidenceAgeSeconds * 1000
    );
  }

  private effectiveValidUntil(
    observedAt: Date,
    validUntil: Date,
    maxAgeSeconds: number,
  ): Date {
    return new Date(
      Math.min(
        validUntil.getTime(),
        observedAt.getTime() + maxAgeSeconds * 1000,
      ),
    );
  }

  private parseScaled(value: string, scale: bigint, field: string): bigint {
    if (!/^-?\d+(?:\.\d+)?$/.test(value)) {
      throw new ConflictException(`${field}_DECIMAL_INVALID`);
    }
    const negative = value.startsWith('-');
    const unsigned = negative ? value.slice(1) : value;
    const [whole, fraction = ''] = unsigned.split('.');
    const digits = scale.toString().length - 1;
    const padded = `${fraction}${'0'.repeat(digits)}`.slice(0, digits);
    const result = BigInt(whole!) * scale + BigInt(padded || '0');
    return negative ? -result : result;
  }

  private multiplyScaled(left: bigint, right: bigint, scale: bigint): bigint {
    const product = left * right;
    return product >= 0n
      ? (product + scale / 2n) / scale
      : (product - scale / 2n) / scale;
  }

  private divideRate(numerator: bigint, denominator: bigint): bigint {
    if (denominator <= 0n) throw new ConflictException('SALE_PRICE_INVALID');
    return (numerator * RATE_SCALE) / denominator;
  }

  private formatScaled(value: bigint, scale: bigint, digits: number): string {
    const negative = value < 0n;
    const absolute = negative ? -value : value;
    return `${negative ? '-' : ''}${absolute / scale}.${(absolute % scale)
      .toString()
      .padStart(digits, '0')}`;
  }

  private workspaceScopeKey(workspaceId: string | null): string {
    return workspaceId === null
      ? 'workspace:empty'
      : `workspace:id:${workspaceId}`;
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private canonicalJson(value: unknown): string {
    return JSON.stringify(this.canonicalValue(value));
  }

  private canonicalValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.canonicalValue(item));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .filter(([, item]) => item !== undefined)
          .sort(([left], [right]) => this.compare(left, right))
          .map(([key, item]) => [key, this.canonicalValue(item)]),
      );
    }
    return value;
  }

  private compare(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
  }
}

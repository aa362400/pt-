import { createHash } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  CandidateEconomicsEvaluation,
  CandidateEconomicsEvaluationInput,
  CandidateEconomicsEvidence,
  Prisma,
  ProductCandidate,
  SupplierQuoteEvidence,
} from '@prisma/client';
import {
  CANDIDATE_ECONOMICS_CALCULATOR_VERSION,
  CANDIDATE_ECONOMICS_EVALUATION_SCHEMA_VERSION,
  CANDIDATE_ECONOMICS_POLICY_VERSION,
} from '../product-research/daily/contracts/trusted-economics.contract.js';
import { RiskClearanceVerifierService } from '../../shared/risk/risk-clearance-verifier.service.js';

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const REQUIRED_INPUT_ROLES = [
  'ADVERTISING',
  'DOMESTIC_TRANSPORT',
  'FX_VOLATILITY_RESERVE',
  'OZON_COMMISSION',
  'OZON_FULFILLMENT',
  'OZON_PAYMENT',
  'OZON_STORAGE',
  'PACKAGING',
  'REFUND_LOSS',
  'SALE_PRICE',
  'TAX',
] as const;

export interface CandidateEconomicsPublicationProof {
  evaluationId: string;
  contentHash: string;
  inputSetHash: string;
  validUntil: string;
  status: 'VERIFIED';
  decision: 'PASS';
  candidateId: string;
  researchRunId: string;
  currency: string;
  salePrice: string;
  grossProfitBeforeAds: string;
  grossMarginBeforeAds: string;
  netProfitAfterAds: string;
  netMarginAfterAds: string;
  totalCost: string;
  componentBreakdown: Record<string, unknown>;
  policyVersion: string;
  calculatorVersion: string;
  policyHash: string;
  rawSnapshotSetHash: string;
  supplierQuoteEvidenceId: string;
  inputCount: number;
  risk: {
    clearanceRecordId: string;
    ruleVersion: string;
    fetchedAt: string;
    evidenceHash: string;
  };
}

type ProofEvaluation = CandidateEconomicsEvaluation & {
  candidate: Pick<
    ProductCandidate,
    | 'id'
    | 'organizationId'
    | 'workspaceId'
    | 'researchRunId'
    | 'fingerprint'
    | 'status'
    | 'canonicalName'
    | 'productType'
    | 'material'
    | 'primaryUse'
  >;
  supplierQuote: Pick<
    SupplierQuoteEvidence,
    | 'id'
    | 'organizationId'
    | 'workspaceId'
    | 'workspaceScopeKey'
    | 'researchRunId'
    | 'candidateId'
    | 'verificationStatus'
    | 'priceKind'
    | 'shippingScope'
    | 'rawSnapshotSha256'
    | 'rawSnapshotRef'
    | 'contentHash'
    | 'validUntil'
  > | null;
  inputs: Array<
    CandidateEconomicsEvaluationInput & {
      evidence: Pick<
        CandidateEconomicsEvidence,
        | 'id'
        | 'organizationId'
        | 'workspaceId'
        | 'workspaceScopeKey'
        | 'researchRunId'
        | 'candidateId'
        | 'kind'
        | 'verificationStatus'
        | 'observedAt'
        | 'validUntil'
        | 'rawSnapshotSha256'
        | 'rawSnapshotRef'
        | 'contentHash'
        | 'normalizedEvidence'
      >;
    }
  >;
};

@Injectable()
export class CandidateEconomicsPublishProofService {
  constructor(private readonly riskClearance: RiskClearanceVerifierService) {}

  async requireInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      workspaceId: string;
      candidateId: string | null | undefined;
      evaluationId: string | null | undefined;
      expectedContentHash: string | null | undefined;
      at: Date;
      expectedPrice?: number;
      expectedCurrency?: string;
    },
  ): Promise<CandidateEconomicsPublicationProof> {
    const candidateId = this.nonEmpty(input.candidateId);
    const evaluationId = this.nonEmpty(input.evaluationId);
    const expectedContentHash = this.nonEmpty(input.expectedContentHash);
    if (
      !candidateId ||
      !evaluationId ||
      !expectedContentHash ||
      !HASH_PATTERN.test(expectedContentHash)
    ) {
      throw this.error(
        'PUBLISH_ECONOMICS_PROOF_REQUIRED',
        'A launch must be bound to one exact verified candidate economics evaluation before publication.',
      );
    }

    const evaluationDelegate = tx.candidateEconomicsEvaluation as unknown as {
      findFirst(args: Record<string, unknown>): Promise<ProofEvaluation | null>;
    };
    const evaluation = await evaluationDelegate.findFirst({
      where: {
        id: evaluationId,
        organizationId: input.organizationId,
      },
      include: {
        candidate: {
          select: {
            id: true,
            organizationId: true,
            workspaceId: true,
            researchRunId: true,
            fingerprint: true,
            status: true,
            canonicalName: true,
            productType: true,
            material: true,
            primaryUse: true,
          },
        },
        supplierQuote: {
          select: {
            id: true,
            organizationId: true,
            workspaceId: true,
            workspaceScopeKey: true,
            researchRunId: true,
            candidateId: true,
            verificationStatus: true,
            priceKind: true,
            shippingScope: true,
            rawSnapshotSha256: true,
            rawSnapshotRef: true,
            contentHash: true,
            validUntil: true,
          },
        },
        inputs: {
          orderBy: { ordinal: 'asc' },
          include: {
            evidence: {
              select: {
                id: true,
                organizationId: true,
                workspaceId: true,
                workspaceScopeKey: true,
                researchRunId: true,
                candidateId: true,
                kind: true,
                verificationStatus: true,
                observedAt: true,
                validUntil: true,
                rawSnapshotSha256: true,
                rawSnapshotRef: true,
                contentHash: true,
                normalizedEvidence: true,
              },
            },
          },
        },
      },
    });
    if (!evaluation) {
      throw this.error(
        'PUBLISH_ECONOMICS_PROOF_INVALID',
        'The bound candidate economics evaluation was not found in this organization.',
      );
    }

    const reasons: string[] = [];
    const candidate = evaluation.candidate;
    const expectedWorkspaceScopeKey = `workspace:id:${input.workspaceId}`;
    if (
      candidate.id !== candidateId ||
      candidate.organizationId !== input.organizationId ||
      candidate.workspaceId !== input.workspaceId ||
      candidate.researchRunId !== evaluation.researchRunId ||
      candidate.status !== 'RECOMMENDED' ||
      evaluation.candidateId !== candidateId ||
      evaluation.workspaceId !== input.workspaceId ||
      evaluation.workspaceScopeKey !== expectedWorkspaceScopeKey
    ) {
      reasons.push('CANDIDATE_BINDING_INVALID');
    }
    if (
      evaluation.schemaVersion !==
        CANDIDATE_ECONOMICS_EVALUATION_SCHEMA_VERSION ||
      evaluation.policyVersion !== CANDIDATE_ECONOMICS_POLICY_VERSION ||
      evaluation.calculatorVersion !== CANDIDATE_ECONOMICS_CALCULATOR_VERSION
    ) {
      reasons.push('ECONOMICS_CONTRACT_VERSION_INVALID');
    }
    if (
      evaluation.status !== 'VERIFIED' ||
      evaluation.decision !== 'PASS' ||
      evaluation.hardGateReasons.length > 0
    ) {
      reasons.push('ECONOMICS_DECISION_NOT_PUBLISHABLE');
    }
    if (
      evaluation.contentHash !== expectedContentHash ||
      !HASH_PATTERN.test(evaluation.contentHash) ||
      !HASH_PATTERN.test(evaluation.inputSetHash) ||
      !HASH_PATTERN.test(evaluation.rawSnapshotSetHash) ||
      !HASH_PATTERN.test(evaluation.policyHash)
    ) {
      reasons.push('ECONOMICS_HASH_BINDING_INVALID');
    }

    const policy = this.record(evaluation.policySnapshot);
    const dispatchBufferSeconds = this.positiveInteger(
      policy.dispatchFreshnessBufferSeconds,
    );
    const maxEvidenceAgeSeconds = this.positiveInteger(
      policy.maxEvidenceAgeSeconds,
    );
    if (
      dispatchBufferSeconds === null ||
      maxEvidenceAgeSeconds === null ||
      evaluation.validFrom.getTime() > input.at.getTime() ||
      evaluation.validUntil.getTime() <=
        input.at.getTime() + (dispatchBufferSeconds ?? 0) * 1000
    ) {
      reasons.push('ECONOMICS_PROOF_STALE');
    }

    const salePrice = this.decimal(evaluation.salePrice, 4);
    const grossProfitBeforeAds = this.decimal(
      evaluation.grossProfitBeforeAds,
      4,
    );
    const grossMarginBeforeAds = this.decimal(
      evaluation.grossMarginBeforeAds,
      8,
    );
    const netProfitAfterAds = this.decimal(evaluation.netProfitAfterAds, 4);
    const netMarginAfterAds = this.decimal(evaluation.netMarginAfterAds, 8);
    const totalCost = this.decimal(evaluation.totalCost, 4);
    if (
      salePrice === null ||
      grossProfitBeforeAds === null ||
      grossMarginBeforeAds === null ||
      netProfitAfterAds === null ||
      netMarginAfterAds === null ||
      totalCost === null ||
      Number(salePrice) <= 0 ||
      Number(totalCost) <= 0 ||
      Number(netProfitAfterAds) <= 0 ||
      Number(grossMarginBeforeAds) < 0.5 ||
      Number(netMarginAfterAds) <= 0
    ) {
      reasons.push('ECONOMICS_RESULT_SHAPE_INVALID');
    }
    if (
      input.expectedPrice !== undefined &&
      (salePrice === null ||
        Math.abs(Number(salePrice) - input.expectedPrice) > 0.00005)
    ) {
      reasons.push('SALE_PRICE_BINDING_INVALID');
    }
    if (
      input.expectedCurrency !== undefined &&
      evaluation.currency.toUpperCase() !== input.expectedCurrency.toUpperCase()
    ) {
      reasons.push('SALE_CURRENCY_BINDING_INVALID');
    }
    const componentBreakdown = this.record(evaluation.componentBreakdown);
    const beforeAdsComponentNames = [
      'procurement',
      'domesticTransport',
      'internationalLogistics',
      'packaging',
      'ozonCommission',
      'payment',
      'fulfillment',
      'storage',
      'tax',
      'fxVolatilityReserve',
    ] as const;
    const afterAdsComponentNames = ['advertising', 'refundLoss'] as const;
    const beforeAdsComponents = beforeAdsComponentNames.map((name) =>
      this.moneyComponent(componentBreakdown[name], evaluation.currency),
    );
    const afterAdsComponents = afterAdsComponentNames.map((name) =>
      this.moneyComponent(componentBreakdown[name], evaluation.currency),
    );
    const customs = this.record(
      componentBreakdown.customsVatClearanceDestinationDelivery,
    );
    if (
      beforeAdsComponents.some((value) => value === null) ||
      afterAdsComponents.some((value) => value === null) ||
      this.money(customs.amount) !== 0 ||
      customs.currency !== evaluation.currency ||
      customs.treatment !== 'INCLUDED_BY_SUPPLIER_LANDED_RU'
    ) {
      reasons.push('ECONOMICS_COMPONENT_BREAKDOWN_INVALID');
    } else if (
      salePrice !== null &&
      grossProfitBeforeAds !== null &&
      grossMarginBeforeAds !== null &&
      netProfitAfterAds !== null &&
      netMarginAfterAds !== null &&
      totalCost !== null
    ) {
      const sale = Number(salePrice);
      const beforeAdsCost = beforeAdsComponents.reduce<number>(
        (sum, value) => sum + (value ?? 0),
        0,
      );
      const afterAdsCost = afterAdsComponents.reduce<number>(
        (sum, value) => sum + (value ?? 0),
        0,
      );
      const expectedGrossProfit = sale - beforeAdsCost;
      const expectedTotalCost = beforeAdsCost + afterAdsCost;
      const expectedNetProfit = sale - expectedTotalCost;
      if (
        Math.abs(expectedGrossProfit - Number(grossProfitBeforeAds)) > 0.01 ||
        Math.abs(expectedTotalCost - Number(totalCost)) > 0.01 ||
        Math.abs(expectedNetProfit - Number(netProfitAfterAds)) > 0.01 ||
        Math.abs(expectedGrossProfit / sale - Number(grossMarginBeforeAds)) >
          0.00000001 ||
        Math.abs(expectedNetProfit / sale - Number(netMarginAfterAds)) >
          0.00000001
      ) {
        reasons.push('ECONOMICS_ARITHMETIC_INVALID');
      }
    }

    const supplierQuote = evaluation.supplierQuote;
    if (
      !supplierQuote ||
      supplierQuote.id !== evaluation.supplierQuoteEvidenceId ||
      supplierQuote.organizationId !== input.organizationId ||
      supplierQuote.workspaceId !== input.workspaceId ||
      supplierQuote.workspaceScopeKey !== expectedWorkspaceScopeKey ||
      supplierQuote.researchRunId !== evaluation.researchRunId ||
      supplierQuote.candidateId !== evaluation.candidateId ||
      supplierQuote.verificationStatus !== 'VERIFIED' ||
      supplierQuote.priceKind !== 'EXACT' ||
      supplierQuote.shippingScope !== 'LANDED_RU' ||
      supplierQuote.validUntil.getTime() <= input.at.getTime() ||
      !HASH_PATTERN.test(supplierQuote.contentHash) ||
      !HASH_PATTERN.test(supplierQuote.rawSnapshotSha256) ||
      supplierQuote.rawSnapshotRef !==
        `supplier-quotes/${input.organizationId}/raw/${supplierQuote.rawSnapshotSha256}`
    ) {
      reasons.push('SUPPLIER_QUOTE_PROOF_INVALID');
    }

    const roles = evaluation.inputs.map((row) => row.role);
    const roleSet = new Set(roles);
    if (
      roleSet.size !== roles.length ||
      REQUIRED_INPUT_ROLES.some((role) => !roleSet.has(role)) ||
      roles.some(
        (role) =>
          !REQUIRED_INPUT_ROLES.includes(
            role as (typeof REQUIRED_INPUT_ROLES)[number],
          ) && role !== 'FX_RATE',
      )
    ) {
      reasons.push('ECONOMICS_INPUT_ROLES_INVALID');
    }
    for (const row of evaluation.inputs) {
      const evidence = row.evidence;
      if (
        row.organizationId !== input.organizationId ||
        row.workspaceId !== input.workspaceId ||
        row.workspaceScopeKey !== expectedWorkspaceScopeKey ||
        row.researchRunId !== evaluation.researchRunId ||
        row.candidateId !== evaluation.candidateId ||
        row.evaluationId !== evaluation.id ||
        row.economicsEvidenceId !== evidence.id ||
        row.role !== evidence.kind ||
        row.evidenceContentHash !== evidence.contentHash ||
        row.rawSnapshotSha256 !== evidence.rawSnapshotSha256 ||
        evidence.organizationId !== input.organizationId ||
        evidence.workspaceId !== input.workspaceId ||
        evidence.workspaceScopeKey !== expectedWorkspaceScopeKey ||
        evidence.researchRunId !== evaluation.researchRunId ||
        evidence.candidateId !== evaluation.candidateId ||
        evidence.verificationStatus !== 'VERIFIED' ||
        evidence.observedAt.getTime() > input.at.getTime() ||
        evidence.validUntil.getTime() <= input.at.getTime() ||
        !HASH_PATTERN.test(evidence.contentHash) ||
        !HASH_PATTERN.test(evidence.rawSnapshotSha256) ||
        evidence.rawSnapshotRef !==
          `economics-evidence/${input.organizationId}/raw/${evidence.rawSnapshotSha256}` ||
        this.sha256(this.canonicalJson(evidence.normalizedEvidence)) !==
          evidence.contentHash
      ) {
        reasons.push(`ECONOMICS_INPUT_INVALID:${row.role}`);
      }
    }

    const sortedInputs = evaluation.inputs.map((row) => ({
      role: row.role,
      evidenceId: row.economicsEvidenceId,
      contentHash: row.evidenceContentHash,
      rawSnapshotSha256: row.rawSnapshotSha256,
    }));
    const recomputedPolicyHash = this.sha256(
      this.canonicalJson(evaluation.policySnapshot),
    );
    const recomputedInputSetHash = this.sha256(
      this.canonicalJson({
        organizationId: input.organizationId,
        workspaceScopeKey: evaluation.workspaceScopeKey,
        researchRunId: evaluation.researchRunId,
        candidateId: evaluation.candidateId,
        candidateFingerprint: candidate.fingerprint,
        policyHash: evaluation.policyHash,
        calculatorVersion: evaluation.calculatorVersion,
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
    const recomputedRawSnapshotSetHash = this.sha256(
      this.canonicalJson(
        [
          ...(supplierQuote ? [supplierQuote.rawSnapshotSha256] : []),
          ...evaluation.inputs.map((row) => row.rawSnapshotSha256),
        ].sort((left, right) => this.compare(left, right)),
      ),
    );
    if (
      recomputedPolicyHash !== evaluation.policyHash ||
      recomputedInputSetHash !== evaluation.inputSetHash ||
      recomputedRawSnapshotSetHash !== evaluation.rawSnapshotSetHash
    ) {
      reasons.push('ECONOMICS_INPUT_SET_HASH_INVALID');
    }

    const recomputedContentHash = this.sha256(
      this.canonicalJson({
        schemaVersion: evaluation.schemaVersion,
        organizationId: evaluation.organizationId,
        workspaceId: evaluation.workspaceId,
        workspaceScopeKey: evaluation.workspaceScopeKey,
        researchRunId: evaluation.researchRunId,
        candidateId: evaluation.candidateId,
        candidateFingerprint: candidate.fingerprint,
        supplierQuoteEvidenceId: evaluation.supplierQuoteEvidenceId,
        policyVersion: evaluation.policyVersion,
        calculatorVersion: evaluation.calculatorVersion,
        policySnapshot: evaluation.policySnapshot,
        policyHash: evaluation.policyHash,
        inputSetHash: evaluation.inputSetHash,
        rawSnapshotSetHash: evaluation.rawSnapshotSetHash,
        status: evaluation.status,
        decision: evaluation.decision,
        currency: evaluation.currency,
        salePrice,
        grossProfitBeforeAds,
        grossMarginBeforeAds,
        netProfitAfterAds,
        netMarginAfterAds,
        totalCost,
        componentBreakdown: evaluation.componentBreakdown,
        hardGateReasons: evaluation.hardGateReasons,
        validFrom: evaluation.validFrom.toISOString(),
        validUntil: evaluation.validUntil.toISOString(),
      }),
    );
    if (recomputedContentHash !== evaluation.contentHash) {
      reasons.push('ECONOMICS_CONTENT_HASH_INVALID');
    }

    const riskRows = await tx.productRiskRecord.findMany({
      where: {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        researchRunId: evaluation.researchRunId,
        candidateId: evaluation.candidateId,
      },
      orderBy: { createdAt: 'desc' },
    });
    const unsafeRisk = riskRows.some((row) => row.severity !== 'LOW');
    const clearance = riskRows.find(
      (row) =>
        row.riskType === 'RISK_CLEARANCE_ATTESTED' &&
        row.severity === 'LOW' &&
        ['AUTO', 'CONFIRMED'].includes(row.reviewStatus),
    );
    const expectedRiskSubjectHash = this.riskClearance.subjectHash({
      title: candidate.canonicalName,
      description: candidate.productType,
      tags: [candidate.material, candidate.primaryUse].filter(Boolean),
      profile: {
        category: candidate.productType,
        materials: candidate.material ?? '',
        productName: candidate.canonicalName,
      },
      platform: 'ozon',
      scopeId: `candidate:${input.organizationId}:${candidate.id}`,
    });
    const riskVerification = clearance
      ? this.riskClearance.verify({
          evidence: clearance.evidence,
          expectedSubjectHash: expectedRiskSubjectHash,
          at: input.at,
        })
      : ({ valid: false, reason: 'MALFORMED' } as const);
    const verifiedRisk = riskVerification.valid ? riskVerification.proof : null;
    const fetchedAt = verifiedRisk
      ? new Date(verifiedRisk.attestation.fetchedAt)
      : null;
    if (
      unsafeRisk ||
      !clearance ||
      !verifiedRisk ||
      clearance.ruleVersion !== verifiedRisk.attestation.ruleset ||
      clearance.source !== verifiedRisk.attestation.provider ||
      !fetchedAt ||
      maxEvidenceAgeSeconds === null ||
      fetchedAt.getTime() > input.at.getTime() ||
      input.at.getTime() - fetchedAt.getTime() > maxEvidenceAgeSeconds * 1000
    ) {
      reasons.push('RISK_CLEARANCE_PROOF_INVALID');
    }

    if (reasons.length > 0) {
      const uniqueReasons = [...new Set(reasons)].sort((left, right) =>
        this.compare(left, right),
      );
      throw this.error(
        uniqueReasons.includes('ECONOMICS_PROOF_STALE')
          ? 'PUBLISH_ECONOMICS_PROOF_STALE'
          : 'PUBLISH_ECONOMICS_PROOF_INVALID',
        'The candidate economics or risk-clearance proof is missing, stale, mismatched, or not publishable.',
        { reasons: uniqueReasons },
      );
    }

    return {
      evaluationId: evaluation.id,
      contentHash: evaluation.contentHash,
      inputSetHash: evaluation.inputSetHash,
      validUntil: evaluation.validUntil.toISOString(),
      status: 'VERIFIED',
      decision: 'PASS',
      candidateId: evaluation.candidateId,
      researchRunId: evaluation.researchRunId,
      currency: evaluation.currency,
      salePrice: salePrice!,
      grossProfitBeforeAds: grossProfitBeforeAds!,
      grossMarginBeforeAds: grossMarginBeforeAds!,
      netProfitAfterAds: netProfitAfterAds!,
      netMarginAfterAds: netMarginAfterAds!,
      totalCost: totalCost!,
      componentBreakdown,
      policyVersion: evaluation.policyVersion,
      calculatorVersion: evaluation.calculatorVersion,
      policyHash: evaluation.policyHash,
      rawSnapshotSetHash: evaluation.rawSnapshotSetHash,
      supplierQuoteEvidenceId: supplierQuote!.id,
      inputCount: evaluation.inputs.length,
      risk: {
        clearanceRecordId: clearance!.id,
        ruleVersion: clearance!.ruleVersion,
        fetchedAt: fetchedAt!.toISOString(),
        evidenceHash: verifiedRisk!.evidenceHash,
      },
    };
  }

  private decimal(value: unknown, digits: number): string | null {
    if (value === null || value === undefined) return null;
    if (
      typeof value === 'object' &&
      value !== null &&
      'toFixed' in value &&
      typeof (value as { toFixed?: unknown }).toFixed === 'function'
    ) {
      return (value as { toFixed(digits: number): string }).toFixed(digits);
    }
    if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'bigint'
    ) {
      return null;
    }
    const raw = String(value).trim();
    const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw);
    if (!match) return null;
    const fraction = `${match[3] ?? ''}${'0'.repeat(digits)}`.slice(0, digits);
    return `${match[1]}${match[2]}.${fraction}`;
  }

  private moneyComponent(value: unknown, currency: string): number | null {
    const component = this.record(value);
    if (component.currency !== undefined && component.currency !== currency) {
      return null;
    }
    return this.money(component.amount);
  }

  private money(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  private positiveInteger(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private nonEmpty(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : null;
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

  private error(
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    return new BadRequestException({ code, message, ...(details ?? {}) });
  }
}

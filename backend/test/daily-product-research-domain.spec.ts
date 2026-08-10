import { DemandAnalysisService } from '../src/features/product-research/daily/services/demand-analysis.service.js';
import { NormalizationService } from '../src/features/product-research/daily/services/normalization.service.js';
import { ProfitCapacityService } from '../src/features/product-research/daily/services/profit-capacity.service.js';
import { RiskAnalysisService } from '../src/features/product-research/daily/services/risk-analysis.service.js';
import { ComplianceScannerService } from '../src/features/product-research/daily/services/compliance-scanner.service.js';
import { ScoringService } from '../src/features/product-research/daily/services/scoring.service.js';
import { DailyReportRendererService } from '../src/features/product-research/daily/reports/daily-report-renderer.service.js';
import { BusinessTimeService } from '../src/features/product-research/daily/services/business-time.service.js';
import { CompetitionAnalysisService } from '../src/features/product-research/daily/services/competition-analysis.service.js';
import { externalCandidateSchema } from '../src/features/product-research/daily/contracts/external-candidate.contract.js';
import { ValidationPipe } from '@nestjs/common';
import { ManualDailyResearchRunDto } from '../src/features/product-research/daily/daily-product-research.dto.js';

describe('daily product research domain', () => {
  it('normalizes equivalent cross-platform products to the same fingerprint', () => {
    const service = new NormalizationService();

    const first = service.normalize({
      name: 'Personalized Wooden Pen',
      productType: 'Pen',
      material: 'Wood',
      customizationMethod: 'Laser Engraving',
    });
    const second = service.normalize({
      name: '  custom wooden pens  ',
      productType: 'pens',
      material: 'wooden',
      customizationMethod: 'laser engraved',
    });

    expect(first.fingerprint).toBe(second.fingerprint);
  });

  it('keeps distinct catalog products separate even when their category attributes match', () => {
    const service = new NormalizationService();

    const large = service.normalize({
      name: 'Car trunk organizer 70 x 30 x 30 cm',
      productType: 'Car organizer',
      primaryUse: 'Trunk storage',
    });
    const compact = service.normalize({
      name: 'Car trunk organizer 50 x 30 x 25 cm',
      productType: 'Car organizer',
      primaryUse: 'Trunk storage',
    });

    expect(large.fingerprint).not.toBe(compact.fingerprint);
  });

  it('uses a source item identity to separate same-title catalog variants', () => {
    const service = new NormalizationService();
    const common = {
      name: 'Kitchen sink organizer',
      productType: 'Kitchen organizer',
      primaryUse: 'Sink storage',
    };

    const first = service.normalize({
      ...common,
      identityKey: 'ozon:item-100',
    });
    const second = service.normalize({
      ...common,
      identityKey: 'ozon:item-200',
    });

    expect(first.fingerprint).not.toBe(second.fingerprint);
  });

  it('uses an explicit evidence group to merge cross-source observations while retaining external ids', () => {
    const service = new NormalizationService();
    const evidenceGroupKey = `global_product_concept:${'a'.repeat(64)}`;
    const common = {
      provider: 'serper',
      productType: 'dog water bottle',
      evidenceGroupKey,
      salePrice: null,
      currency: null,
      costs: [],
      platformFeeRate: '0',
      paymentFeeRate: '0',
      adRate: '0',
      refundRate: '0',
      signals: [],
      risks: [],
    };
    const demand = externalCandidateSchema.parse({
      ...common,
      source: 'temu_public_search',
      externalId: 'temu-123',
      name: 'Portable dog water bottle',
    });
    const shopping = externalCandidateSchema.parse({
      ...common,
      source: 'google_shopping_public_sample',
      externalId: 'shopping-456',
      name: 'portable-dog water bottle',
    });

    const demandIdentity = (service as any).evidenceIdentityKey(demand);
    const shoppingIdentity = (service as any).evidenceIdentityKey(shopping);
    const demandNormalized = service.normalize({
      ...demand,
      identityKey: demandIdentity,
    });
    const shoppingNormalized = service.normalize({
      ...shopping,
      identityKey: shoppingIdentity,
    });

    expect(demand.externalId).toBe('temu-123');
    expect(shopping.externalId).toBe('shopping-456');
    expect(demandNormalized.fingerprint).toBe(shoppingNormalized.fingerprint);
  });

  it('requires independent purchase-intent sources for a strong demand signal', () => {
    const service = new DemandAnalysisService();
    const result = service.analyze([
      {
        source: 'ozon',
        metricName: 'orders',
        quality: 'VERIFIED',
        metricValue: '120',
      },
      {
        source: 'etsy',
        metricName: 'favorites',
        quality: 'VERIFIED',
        metricValue: '84',
      },
      {
        source: 'google_trends',
        metricName: 'search_growth',
        quality: 'ESTIMATED',
        metricValue: '18',
      },
      {
        source: 'tiktok',
        metricName: 'views',
        quality: 'VERIFIED',
        metricValue: '900000',
      },
    ]);

    expect(result.signalStrength).toBe('STRONG');
    expect(result.independentPurchaseIntentSources).toBe(3);
    expect(result.contentOnlySources).toEqual(['tiktok']);
  });

  it('treats a verified marketplace review count as one weak purchase-intent source', () => {
    const service = new DemandAnalysisService();
    const result = service.analyze([
      {
        source: 'ozon',
        metricName: 'review_count',
        quality: 'VERIFIED',
        metricValue: '17006',
      },
    ]);

    expect(result.signalStrength).toBe('WEAK');
    expect(result.independentPurchaseIntentSources).toBe(1);
    expect(result.evidenceSources).toEqual(['ozon']);
  });

  it('never treats content views alone as verified demand', () => {
    const service = new DemandAnalysisService();
    const result = service.analyze([
      {
        source: 'tiktok',
        metricName: 'views',
        quality: 'VERIFIED',
        metricValue: '900000',
      },
    ]);

    expect(result.signalStrength).toBe('INVALID');
    expect(result.confidenceScore).toBe(0);
  });

  it('labels Ozon competition as a bounded public-search sample', () => {
    const service = new CompetitionAnalysisService();
    const result = service.analyze([
      {
        source: 'ozon_public_search_sample',
        metricName: 'ozon_public_search_result_count',
        quality: 'ESTIMATED',
        metricValue: '1',
      },
    ]);

    expect(result.missingEvidence).toEqual([]);
    expect(result.entryOpportunityScore).not.toBeNull();
    expect(result.claims.join(' ')).toContain('not a full-catalog count');
  });

  it('blocks recommendation when a required cost is unknown', () => {
    const service = new ProfitCapacityService();
    const result = service.calculate({
      currency: 'CNY',
      salePrice: '100.00',
      costs: [
        { code: 'PRODUCT', amount: '20.00', required: true },
        { code: 'SHIPPING', amount: null, required: true },
      ],
      platformFeeRate: '0.12',
      paymentFeeRate: '0.01',
      adRate: '0.10',
      refundRate: '0.03',
    });

    expect(result.netProfitAfterAds).toBeNull();
    expect(result.hardGateReasons).toContain('MISSING_REQUIRED_COST:SHIPPING');
  });

  it('blocks recommendation when required product and shipping costs are absent', () => {
    const service = new ProfitCapacityService();
    const result = service.calculate({
      currency: 'CNY',
      salePrice: '100.00',
      costs: [],
      platformFeeRate: '0.12',
      paymentFeeRate: '0.01',
      adRate: '0.10',
      refundRate: '0.03',
    });

    expect(result.netProfitAfterAds).toBeNull();
    expect(result.hardGateReasons).toEqual([
      'MISSING_REQUIRED_COST:PRODUCT',
      'MISSING_REQUIRED_COST:SHIPPING',
    ]);
  });

  it('does not allow mandatory product and shipping costs to opt out of the hard gate', () => {
    const service = new ProfitCapacityService();
    const result = service.calculate({
      currency: 'CNY',
      salePrice: '100.00',
      costs: [
        { code: 'PRODUCT', amount: null, required: false },
        { code: 'SHIPPING', amount: null, required: false },
      ],
      platformFeeRate: '0.12',
      paymentFeeRate: '0.01',
      adRate: '0.10',
      refundRate: '0.03',
    });

    expect(result.netProfitAfterAds).toBeNull();
    expect(result.hardGateReasons).toEqual([
      'MISSING_REQUIRED_COST:PRODUCT',
      'MISSING_REQUIRED_COST:SHIPPING',
    ]);
  });

  it('blocks a zero product cost from masquerading as verified economics', () => {
    const service = new ProfitCapacityService();
    const result = service.calculate({
      currency: 'CNY',
      salePrice: '100.00',
      costs: [
        { code: 'PRODUCT', amount: '0', required: true },
        { code: 'SHIPPING', amount: '7.00', required: true },
      ],
      platformFeeRate: '0.12',
      paymentFeeRate: '0.01',
      adRate: '0.10',
      refundRate: '0.03',
    });

    expect(result.netProfitAfterAds).toBeNull();
    expect(result.hardGateReasons).toContain('MISSING_REQUIRED_COST:PRODUCT');
  });

  it('does not synthesize zero fee rates when economics rates are unknown', () => {
    const result = externalCandidateSchema.safeParse({
      source: 'manual',
      provider: 'operator',
      name: 'Wooden pen',
      productType: 'pen',
      salePrice: '100.00',
      currency: 'CNY',
      costs: [
        { code: 'PRODUCT', amount: '20.00', required: true },
        { code: 'SHIPPING', amount: '7.00', required: true },
      ],
      signals: [],
    });

    expect(result.success).toBe(false);
  });

  it('rejects rich supplier costs instead of silently stripping currency and provenance', () => {
    const result = externalCandidateSchema.safeParse({
      source: 'supplier_quote',
      provider: 'future-1688-api',
      name: 'Wood organizer',
      productType: 'organizer',
      salePrice: '1290.00',
      currency: 'RUB',
      costs: [
        {
          code: 'PRODUCT',
          amount: '18.50',
          currency: 'CNY',
          required: true,
          quality: 'VERIFIED',
          evidenceId: 'quote-1',
        },
      ],
      platformFeeRate: '0.12',
      paymentFeeRate: '0.01',
      adRate: '0.10',
      refundRate: '0.03',
      signals: [],
    });

    expect(result.success).toBe(false);
  });

  it('rejects all connector-supplied costs so only persisted supplier evidence can unlock profit', () => {
    const result = externalCandidateSchema.safeParse({
      source: 'manual',
      provider: 'operator',
      name: 'Wood organizer',
      productType: 'organizer',
      salePrice: '100.00',
      currency: 'CNY',
      costs: [
        { code: 'PRODUCT', amount: '18.50', required: true },
        { code: 'SHIPPING', amount: '12.00', required: true },
      ],
      platformFeeRate: '0.12',
      paymentFeeRate: '0.01',
      adRate: '0.10',
      refundRate: '0.03',
      signals: [],
    });

    expect(result.success).toBe(false);
  });

  it('rejects malformed rate strings instead of accepting a valid prefix', () => {
    const result = externalCandidateSchema.safeParse({
      source: 'manual',
      provider: 'operator',
      name: 'Wooden pen',
      productType: 'pen',
      platformFeeRate: '0.12junk',
      signals: [],
    });

    expect(result.success).toBe(false);
  });

  it('requires traceable evidence for supplied qualitative component scores', () => {
    const result = externalCandidateSchema.safeParse({
      source: 'manual',
      provider: 'operator',
      name: 'Wooden pen',
      productType: 'pen',
      signals: [],
      componentEvidence: {
        visual: {
          score: 90,
          method: 'operator review',
          observedAt: '2026-07-13T10:00:00+08:00',
          quality: 'MANUAL',
        },
      },
    });

    expect(result.success).toBe(false);
  });

  it('preserves structured candidate objects through the global validation pipe', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    });
    const transformedValue: unknown = await pipe.transform(
      {
        inputCandidates: [
          {
            source: 'manual',
            provider: 'operator',
            name: 'Wooden pen',
            productType: 'pen',
            signals: [],
          },
        ],
      },
      { type: 'body', metatype: ManualDailyResearchRunDto },
    );
    const transformed = transformedValue as ManualDailyResearchRunDto;

    expect(Array.isArray(transformed.inputCandidates?.[0])).toBe(false);
    expect(transformed.inputCandidates?.[0]?.name).toBe('Wooden pen');
  });

  it('rejects impossible business dates', () => {
    const service = new BusinessTimeService();

    expect(() => service.toDatabaseDate('2026-02-30')).toThrow(
      'businessDate must be a real calendar date',
    );
  });

  it('distinguishes gross profit from net profit using decimal-safe strings', () => {
    const service = new ProfitCapacityService();
    const result = service.calculate({
      currency: 'CNY',
      salePrice: '100.00',
      costs: [
        { code: 'PRODUCT', amount: '20.00', required: true },
        { code: 'SHIPPING', amount: '7.00', required: true },
      ],
      platformFeeRate: '0.12',
      paymentFeeRate: '0.01',
      adRate: '0.10',
      refundRate: '0.03',
    });

    expect(result.grossProfitBeforeAds).toBe('60.00');
    expect(result.netProfitAfterAds).toBe('47.00');
    expect(result.netMarginAfterAds).toBe('0.4700');
  });

  it('turns high compliance findings into a hard rejection', () => {
    const service = new RiskAnalysisService();
    const result = service.evaluate([
      {
        riskType: 'TRADEMARK',
        severity: 'HIGH',
        ruleVersion: 'ip-rules/2026-07',
        matchedTerm: 'protected brand',
        evidence: 'Term appears in the proposed title.',
      },
    ]);

    expect(result.overallSeverity).toBe('HIGH');
    expect(result.hardGateReasons).toEqual(['RISK_HIGH:TRADEMARK']);
    expect(result.requiresHumanReview).toBe(true);
  });

  it('fails closed when no authorized auditable risk clearance is supplied', () => {
    const findings = new ComplianceScannerService().scan({
      texts: ['Portable organizer'],
      forbiddenTerms: [],
      suppliedFindings: [],
    });

    expect(findings).toEqual([
      expect.objectContaining({
        riskType: 'RISK_EVIDENCE_MISSING',
        severity: 'BLOCKED',
      }),
    ]);
  });

  it('never treats an empty finding array as proof of safety', () => {
    const result = new RiskAnalysisService().evaluate([]);

    expect(result.overallSeverity).toBe('BLOCKED');
    expect(result.requiresHumanReview).toBe(true);
    expect(result.hardGateReasons).toContain('RISK_EVIDENCE_MISSING');
    expect(result.findings).toEqual([
      expect.objectContaining({
        riskType: 'RISK_EVIDENCE_MISSING',
        severity: 'BLOCKED',
      }),
    ]);
  });

  it('retains discovered risks when an authorized clearance attestation is present', () => {
    const scanner = new ComplianceScannerService();
    const scanInput: Parameters<ComplianceScannerService['scan']>[0] & {
      authorizedClearanceProviders: string[];
      clearanceAttestation: {
        provider: string;
        ruleset: string;
        evidenceRef: string;
        fetchedAt: string;
        passed: boolean;
      };
    } = {
      texts: ['Protected brand organizer'],
      forbiddenTerms: [],
      suppliedFindings: [
        {
          riskType: 'TRADEMARK',
          severity: 'HIGH',
          ruleVersion: 'ip-rules/2026-07',
          matchedTerm: 'Protected brand',
          evidence: 'The external risk provider detected a protected brand.',
        },
      ],
      authorizedClearanceProviders: ['authorized-risk-provider'],
      clearanceAttestation: {
        provider: 'authorized-risk-provider',
        ruleset: 'global-commerce-risk/2026-07',
        evidenceRef: 'risk-evidence:sha256:abc123',
        fetchedAt: '2026-07-16T06:00:00.000Z',
        passed: true,
      },
    };

    const findings = scanner.scan(scanInput);
    const result = new RiskAnalysisService().evaluate(findings);

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ riskType: 'TRADEMARK', severity: 'HIGH' }),
        expect.objectContaining({
          riskType: 'RISK_CLEARANCE_ATTESTED',
          severity: 'LOW',
        }),
      ]),
    );
    expect(result.overallSeverity).toBe('HIGH');
    expect(result.hardGateReasons).toContain('RISK_HIGH:TRADEMARK');
  });

  it('applies hard gates before ranking and never pads TOP results', () => {
    const service = new ScoringService();
    const result = service.rank(
      [
        {
          candidateId: 'safe-1',
          fingerprint: 'a',
          componentScores: {
            demand: 90,
            growth: 70,
            competition: 80,
            profit: 85,
            customization: 90,
            visual: 75,
            feasibility: 80,
            lifecycle: 70,
            safety: 100,
          },
          hardGateReasons: [],
          confidenceScore: 88,
        },
        {
          candidateId: 'blocked-1',
          fingerprint: 'b',
          componentScores: {
            demand: 100,
            growth: 100,
            competition: 100,
            profit: 100,
            customization: 100,
            visual: 100,
            feasibility: 100,
            lifecycle: 100,
            safety: 100,
          },
          hardGateReasons: ['RISK_HIGH:TRADEMARK'],
          confidenceScore: 99,
        },
        {
          candidateId: 'duplicate-safe-1',
          fingerprint: 'a',
          componentScores: {
            demand: 80,
            growth: 60,
            competition: 70,
            profit: 80,
            customization: 80,
            visual: 70,
            feasibility: 70,
            lifecycle: 60,
            safety: 100,
          },
          hardGateReasons: [],
          confidenceScore: 82,
        },
      ],
      { topLimit: 10 },
    );

    expect(result.testNow.map((item) => item.candidateId)).toEqual(['safe-1']);
    expect(result.rejected.map((item) => item.candidateId)).toContain(
      'blocked-1',
    );
    expect(result.testNow).toHaveLength(1);
  });

  it('uses the selected scoring version weights and thresholds', () => {
    const service = new ScoringService();
    const result = service.rank(
      [
        {
          candidateId: 'profit-first',
          fingerprint: 'profit-first',
          componentScores: {
            demand: 10,
            growth: 10,
            competition: 10,
            profit: 95,
            customization: 10,
            visual: 10,
            feasibility: 10,
            lifecycle: 10,
            safety: 100,
          },
          hardGateReasons: [],
          confidenceScore: 90,
        },
      ],
      {
        topLimit: 10,
        weights: {
          demand: 0,
          growth: 0,
          competition: 0,
          profit: 100,
          customization: 0,
          visual: 0,
          feasibility: 0,
          lifecycle: 0,
          safety: 0,
        },
        thresholds: { testNow: 90, watch: 70, hold: 50 },
      },
    );

    expect(result.testNow[0]?.candidateId).toBe('profit-first');
    expect(result.testNow[0]?.finalScore).toBe(95);
  });

  it('renders a truthful zero-TOP report without invented recommendations', () => {
    const service = new DailyReportRendererService();
    const report = service.render({
      businessDate: '2026-07-13',
      timezone: 'Asia/Shanghai',
      runStatus: 'COMPLETED',
      partialData: true,
      scoringVersion: 'v1',
      sourceHealth: [{ source: 'etsy', status: 'NOT_CONFIGURED' }],
      testNow: [],
      watch: [],
      hold: [],
      rejected: [],
    });

    expect(report.markdown).toContain('english_textnonetext“english_text”english_text');
    expect(report.markdown).toContain('NOT_CONFIGURED');
    expect(report.topJson.items).toEqual([]);
    expect(report.topJson.summary.testNow).toBe(0);
  });
});

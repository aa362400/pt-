import { Injectable } from '@nestjs/common';
import {
  LISTING_BUNDLE_SCHEMA_VERSION,
  ListingBundleService,
  type ListingBundleV1,
} from './listing-bundle.service.js';

export const LISTING_EVALUATOR_VERSION = 'listing-evaluator/v1' as const;

export interface ListingApprovalEvidence {
  approved: true;
  approvedBy: string;
  approvedAt: string;
}

export interface ListingEvaluationCheck {
  id: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  code: string;
  message: string;
  evidence?: Record<string, unknown>;
}

export interface ListingEvaluationResult {
  evaluatorVersion: typeof LISTING_EVALUATOR_VERSION;
  outcome: 'BLOCKED' | 'REVIEW_REQUIRED' | 'QUALIFIED';
  score: number;
  evaluatedAt: string;
  checks: ListingEvaluationCheck[];
  blockingIssues: string[];
  reviewReasons: string[];
  approval: ListingApprovalEvidence | null;
}

const supportedPlatforms = new Set([
  'amazon',
  'shopify',
  'etsy',
  'ebay',
  'ozon',
  'temu',
]);

const placeholderPatterns = [
  /lorem\s+ipsum/i,
  /your\s+text\s+here/i,
  /placeholder/i,
  /todo\b/i,
  /待补充/,
  /占位/,
];

@Injectable()
export class ListingEvaluatorService {
  constructor(private readonly bundles: ListingBundleService) {}

  evaluate(
    bundle: ListingBundleV1,
    options: {
      evaluatedAt?: Date;
      approval?: ListingApprovalEvidence;
    } = {},
  ): ListingEvaluationResult {
    const checks: ListingEvaluationCheck[] = [];

    checks.push(
      this.check(
        'schema-version',
        bundle.schemaVersion === LISTING_BUNDLE_SCHEMA_VERSION,
        'SCHEMA_VERSION_SUPPORTED',
        'UNSUPPORTED_SCHEMA_VERSION',
        'Listing Bundle schema version is supported.',
        'Listing Bundle schema version is not supported.',
        { observed: bundle.schemaVersion },
      ),
    );
    checks.push(
      this.check(
        'platform',
        supportedPlatforms.has(bundle.platform),
        'PLATFORM_SUPPORTED',
        'UNSUPPORTED_PLATFORM',
        'Marketplace target is supported.',
        'Marketplace target is not supported.',
        { observed: bundle.platform },
      ),
    );

    const computedHash = this.bundles.computeOutputSha256(bundle);
    checks.push(
      this.check(
        'provenance-integrity',
        computedHash === bundle.provenance.outputSha256,
        'PROVENANCE_HASH_VALID',
        'PROVENANCE_HASH_MISMATCH',
        'Listing content matches the recorded provenance hash.',
        'Listing content was changed without a matching provenance revision.',
        {
          expected: bundle.provenance.outputSha256,
          computed: computedHash,
        },
      ),
    );

    const copy = [
      bundle.content.title,
      bundle.content.description,
      ...bundle.content.bullets,
    ].join('\n');
    checks.push(
      this.check(
        'placeholder-copy',
        !placeholderPatterns.some((pattern) => pattern.test(copy)),
        'COPY_HAS_NO_PLACEHOLDERS',
        'PLACEHOLDER_COPY_DETECTED',
        'No placeholder copy was detected.',
        'Listing contains placeholder or unfinished copy.',
      ),
    );

    this.addQualityCheck(
      checks,
      'title-quality',
      bundle.content.title.trim().length >= 10,
      'TITLE_TOO_SHORT',
      'Listing title is shorter than the internal quality threshold.',
      { length: bundle.content.title.trim().length, minimum: 10 },
    );
    this.addQualityCheck(
      checks,
      'description-quality',
      bundle.content.description.trim().length >= 40,
      'DESCRIPTION_TOO_SHORT',
      'Listing description is shorter than the internal quality threshold.',
      { length: bundle.content.description.trim().length, minimum: 40 },
    );
    this.addQualityCheck(
      checks,
      'bullet-quality',
      bundle.content.bullets.length >= 2,
      'BULLETS_INCOMPLETE',
      'Listing has fewer than two selling points.',
      { count: bundle.content.bullets.length, minimum: 2 },
    );
    this.addQualityCheck(
      checks,
      'seo-quality',
      bundle.seo.keywords.length >= 2,
      'SEO_KEYWORDS_INCOMPLETE',
      'Listing has fewer than two SEO keywords.',
      { count: bundle.seo.keywords.length, minimum: 2 },
    );

    const hasPrimaryMedia = bundle.mediaMapping.some((mapping) => {
      const role = mapping.role;
      const assetUrl = mapping.assetUrl;
      return (
        role === 'primary' &&
        typeof assetUrl === 'string' &&
        /^https:\/\//i.test(assetUrl)
      );
    });
    checks.push(
      hasPrimaryMedia
        ? {
            id: 'media-readiness',
            status: 'PASS',
            code: 'PRIMARY_MEDIA_PRESENT',
            message: 'Primary HTTPS media is mapped.',
          }
        : {
            id: 'media-readiness',
            status: 'WARN',
            code: 'MEDIA_MAPPING_INCOMPLETE',
            message: 'Primary HTTPS media must be mapped before publication.',
          },
    );

    const suppliedApproval = options.approval;
    const approval =
      suppliedApproval?.approved === true &&
      typeof suppliedApproval.approvedBy === 'string' &&
      suppliedApproval.approvedBy.trim().length > 0 &&
      typeof suppliedApproval.approvedAt === 'string' &&
      Number.isFinite(Date.parse(suppliedApproval.approvedAt))
        ? suppliedApproval
        : null;
    checks.push(
      approval
        ? {
            id: 'human-approval',
            status: 'PASS',
            code: 'HUMAN_APPROVAL_PRESENT',
            message: 'Explicit human approval evidence is present.',
            evidence: {
              approvedBy: approval.approvedBy,
              approvedAt: approval.approvedAt,
            },
          }
        : {
            id: 'human-approval',
            status: 'WARN',
            code: 'HUMAN_APPROVAL_REQUIRED',
            message: 'Explicit human approval is required before publication.',
          },
    );

    const blockingIssues = this.uniqueCodes(checks, 'FAIL');
    const reviewReasons = this.uniqueCodes(checks, 'WARN');
    const score = Math.max(
      0,
      100 - blockingIssues.length * 30 - reviewReasons.length * 5,
    );
    const outcome =
      blockingIssues.length > 0
        ? 'BLOCKED'
        : reviewReasons.length > 0
          ? 'REVIEW_REQUIRED'
          : 'QUALIFIED';

    return {
      evaluatorVersion: LISTING_EVALUATOR_VERSION,
      outcome,
      score,
      evaluatedAt: (options.evaluatedAt ?? new Date()).toISOString(),
      checks,
      blockingIssues,
      reviewReasons,
      approval,
    };
  }

  private check(
    id: string,
    passed: boolean,
    passCode: string,
    failCode: string,
    passMessage: string,
    failMessage: string,
    evidence?: Record<string, unknown>,
  ): ListingEvaluationCheck {
    return {
      id,
      status: passed ? 'PASS' : 'FAIL',
      code: passed ? passCode : failCode,
      message: passed ? passMessage : failMessage,
      ...(evidence ? { evidence } : {}),
    };
  }

  private addQualityCheck(
    checks: ListingEvaluationCheck[],
    id: string,
    passed: boolean,
    warningCode: string,
    warningMessage: string,
    evidence: Record<string, unknown>,
  ): void {
    checks.push({
      id,
      status: passed ? 'PASS' : 'WARN',
      code: passed
        ? `${id.toUpperCase().replaceAll('-', '_')}_PASS`
        : warningCode,
      message: passed
        ? 'Internal content quality threshold passed.'
        : warningMessage,
      evidence,
    });
  }

  private uniqueCodes(
    checks: ListingEvaluationCheck[],
    status: ListingEvaluationCheck['status'],
  ): string[] {
    return [
      ...new Set(
        checks
          .filter((check) => check.status === status)
          .map((check) => check.code),
      ),
    ];
  }
}

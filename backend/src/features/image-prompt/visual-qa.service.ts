import { Injectable } from '@nestjs/common';
import type { ImageGenerationResult } from '../../agents/agent-provider.interface.js';

export const VISUAL_QA_SCHEMA_VERSION = 'visual-qa/v1' as const;
const MINIMUM_CONSISTENCY_SCORE = 80;
const MINIMUM_IMAGE_EDGE = 700;

export type VisualQaCheckStatus = 'PASS' | 'WARN' | 'FAIL';

export interface VisualQaCheck {
  id: string;
  status: VisualQaCheckStatus;
  code: string;
  message: string;
  evidence: Record<string, unknown>;
}

export interface VisualQaResult {
  schemaVersion: typeof VISUAL_QA_SCHEMA_VERSION;
  outcome: 'PASSED' | 'FAILED';
  score: number;
  evaluatedAt: string;
  platform: string;
  reference: { assetId: string; sha256: string };
  policy: {
    requestedSceneCount: number;
    minimumConsistencyScore: number;
    minimumImageEdge: number;
  };
  checks: VisualQaCheck[];
}

interface VisualQaInput {
  platform: string;
  requestedSceneCount: number;
  reference: { assetId: string; sha256: string };
  generation: ImageGenerationResult;
}

@Injectable()
export class VisualQaService {
  evaluate(input: VisualQaInput): VisualQaResult {
    const checks: VisualQaCheck[] = [];
    const { generation, reference } = input;
    const images = generation.images;

    this.add(
      checks,
      'reference-evidence',
      Boolean(reference.assetId && /^[a-f0-9]{64}$/i.test(reference.sha256)),
      'REFERENCE_ASSET_REQUIRED',
      'An immutable reference image and SHA-256 are required.',
      reference,
    );
    this.add(
      checks,
      'provider-mode',
      generation.mockMode === false,
      'MOCK_MEDIA_NOT_ALLOWED',
      'Mock media cannot pass visual QA.',
      { mockMode: generation.mockMode },
    );
    this.add(
      checks,
      'session-provenance',
      generation.sessionId.trim().length > 0,
      'GENERATION_SESSION_MISSING',
      'The image generation session identifier is missing.',
      { sessionId: generation.sessionId },
    );
    this.add(
      checks,
      'product-dna',
      this.hasRecordValues(generation.profile),
      'PRODUCT_DNA_MISSING',
      'The provider did not return a non-empty product profile.',
      { hasProfile: this.hasRecordValues(generation.profile) },
    );
    this.add(
      checks,
      'scene-count',
      images.length >= input.requestedSceneCount,
      'GENERATED_MEDIA_INCOMPLETE',
      'The generated image set is smaller than the approved scene count.',
      { actual: images.length, required: input.requestedSceneCount },
    );
    this.add(
      checks,
      'consistency-score',
      typeof generation.consistencyScore === 'number' &&
        Number.isFinite(generation.consistencyScore) &&
        generation.consistencyScore >= MINIMUM_CONSISTENCY_SCORE,
      'CONSISTENCY_SCORE_BELOW_THRESHOLD',
      'The subject consistency score is below the internal launch threshold.',
      {
        score: generation.consistencyScore ?? null,
        minimum: MINIMUM_CONSISTENCY_SCORE,
      },
    );
    this.add(
      checks,
      'consistency-verdict',
      generation.consistencyPassed === true,
      'CONSISTENCY_QA_FAILED',
      'The independent subject-consistency check did not pass.',
      { consistencyPassed: generation.consistencyPassed ?? null },
    );
    this.add(
      checks,
      'platform-compliance',
      generation.compliancePassed === true,
      'PLATFORM_COMPLIANCE_FAILED',
      'The platform image compliance check did not pass.',
      { compliancePassed: generation.compliancePassed ?? null },
    );

    const externalStatus = generation.externalConsistencyStatus;
    if (externalStatus && externalStatus !== 'skipped') {
      this.add(
        checks,
        'external-consistency',
        externalStatus === 'passed',
        'EXTERNAL_CONSISTENCY_FAILED',
        'The external consistency verifier reported a failure.',
        {
          status: externalStatus,
          score: generation.externalConsistencyScore ?? null,
          issues: generation.externalConsistencyIssues ?? [],
        },
      );
    } else {
      checks.push({
        id: 'external-consistency',
        status: 'WARN',
        code: 'EXTERNAL_CONSISTENCY_NOT_CONFIGURED',
        message: 'External consistency verification was not configured.',
        evidence: { status: externalStatus ?? 'missing' },
      });
    }

    const technicalFactsValid = images.every(
      (image) =>
        Number.isInteger(image.width) &&
        Number.isInteger(image.height) &&
        (image.width ?? 0) >= MINIMUM_IMAGE_EDGE &&
        (image.height ?? 0) >= MINIMUM_IMAGE_EDGE &&
        typeof image.byteSize === 'number' &&
        image.byteSize > 0 &&
        typeof image.mimeType === 'string' &&
        image.mimeType.startsWith('image/') &&
        typeof image.sha256 === 'string' &&
        /^[a-f0-9]{64}$/i.test(image.sha256),
    );
    this.add(
      checks,
      'technical-media-facts',
      images.length > 0 && technicalFactsValid,
      'GENERATED_MEDIA_TECHNICAL_INVALID',
      'Generated media facts are missing or below the internal technical threshold.',
      {
        minimumImageEdge: MINIMUM_IMAGE_EDGE,
        images: images.map((image) => ({
          sceneId: image.sceneId,
          width: image.width ?? null,
          height: image.height ?? null,
          mimeType: image.mimeType ?? null,
          byteSize: image.byteSize ?? null,
          sha256: image.sha256 ?? null,
        })),
      },
    );

    const sceneIds = images.map((image) => image.sceneId.trim());
    const urls = images.map((image) => image.url.trim());
    const hashes = images.map((image) => image.sha256?.trim() ?? '');
    const unique =
      sceneIds.every(Boolean) &&
      new Set(sceneIds).size === sceneIds.length &&
      new Set(urls).size === urls.length &&
      hashes.every(Boolean) &&
      new Set(hashes).size === hashes.length;
    this.add(
      checks,
      'media-uniqueness',
      images.length > 0 && unique,
      'GENERATED_MEDIA_DUPLICATED',
      'Generated images must have unique scene IDs, URLs and content hashes.',
      { sceneIds, urls, hashes },
    );
    this.add(
      checks,
      'public-delivery',
      images.length > 0 && urls.every((url) => /^https:\/\//i.test(url)),
      'GENERATED_MEDIA_NOT_PUBLIC_HTTPS',
      'All media URLs must use public HTTPS before marketplace review.',
      { urls },
    );

    const failed = checks.filter((check) => check.status === 'FAIL').length;
    const scored = checks.filter((check) => check.status !== 'WARN').length;
    return {
      schemaVersion: VISUAL_QA_SCHEMA_VERSION,
      outcome: failed === 0 ? 'PASSED' : 'FAILED',
      score: scored === 0 ? 0 : Math.round(((scored - failed) / scored) * 100),
      evaluatedAt: new Date().toISOString(),
      platform: input.platform,
      reference,
      policy: {
        requestedSceneCount: input.requestedSceneCount,
        minimumConsistencyScore: MINIMUM_CONSISTENCY_SCORE,
        minimumImageEdge: MINIMUM_IMAGE_EDGE,
      },
      checks,
    };
  }

  private add(
    checks: VisualQaCheck[],
    id: string,
    passed: boolean,
    failureCode: string,
    failureMessage: string,
    evidence: Record<string, unknown>,
  ): void {
    checks.push({
      id,
      status: passed ? 'PASS' : 'FAIL',
      code: passed
        ? `${id.toUpperCase().replace(/-/g, '_')}_PASSED`
        : failureCode,
      message: passed ? 'Quality gate passed.' : failureMessage,
      evidence,
    });
  }

  private hasRecordValues(value: unknown): boolean {
    return Boolean(
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length > 0,
    );
  }
}

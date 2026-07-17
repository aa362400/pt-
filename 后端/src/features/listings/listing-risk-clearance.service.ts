import { UnprocessableEntityException } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { ListingBundleV1 } from './listing-bundle.service.js';
import {
  LISTING_RISK_SUBJECT_VERSION,
  RiskClearanceVerifierService,
  type VerifiedRiskClearance,
} from '../../shared/risk/risk-clearance-verifier.service.js';

export const FINAL_LISTING_RISK_CLEARANCE_VERSION =
  'listing-final-risk-clearance/v1' as const;

export interface FinalListingRiskClearance {
  schemaVersion: typeof FINAL_LISTING_RISK_CLEARANCE_VERSION;
  subjectVersion: typeof LISTING_RISK_SUBJECT_VERSION;
  subjectHash: string;
  subject: {
    title: string;
    description: string;
    tags: string[];
    platform: string;
    scopeId: string;
    bullets: string[];
    keywords: string[];
    attributes: Record<string, unknown>;
    imageHashes: string[];
  };
  evidenceHash: string;
  provider: string;
  ruleset: string;
  fetchedAt: string;
  expiresAt: string;
  clearanceEvidence: VerifiedRiskClearance;
  screening: {
    decision: 'PASS';
    screeningStatus: 'CLEARED';
    evidenceStatus: 'ATTESTED';
    publishable: true;
    hardGateReasons: [];
    mcpManifestHash: string;
    mcpExecutableHash: string;
    checkedAt: string;
  };
}

@Injectable()
export class ListingRiskClearanceService {
  constructor(private readonly verifier: RiskClearanceVerifierService) {}

  subject(input: {
    organizationId: string;
    listingDraftId: string;
    bundle: ListingBundleV1;
  }) {
    const imageHashes = input.bundle.mediaMapping.map((item) => {
      const sha256 = this.text(item.assetSha256).toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(sha256)) {
        throw this.error(
          'LISTING_IMAGE_HASH_REQUIRED',
          'Every reviewed listing image must carry its verified SHA-256 digest.',
        );
      }
      return `sha256:${sha256}`;
    });
    if (imageHashes.length === 0) {
      throw this.error(
        'LISTING_IMAGE_HASH_REQUIRED',
        'At least one immutable reviewed listing image is required.',
      );
    }
    const scopeId = `listing:${input.organizationId}:${input.listingDraftId}`;
    const subject = {
      title: input.bundle.content.title,
      description: input.bundle.content.description,
      tags: [],
      platform: input.bundle.platform,
      scopeId,
      bullets: input.bundle.content.bullets,
      keywords: input.bundle.seo.keywords,
      attributes: input.bundle.attributes,
      imageHashes,
    };
    return {
      subject,
      scopeId,
      imageHashes,
      subjectHash: this.verifier.subjectHash(subject),
    };
  }

  build(input: {
    organizationId: string;
    listingDraftId: string;
    bundle: ListingBundleV1;
    clearanceEvidence: unknown;
    screeningResult: unknown;
    mcpManifestHash: string;
    mcpExecutableHash: string;
    at: Date;
  }): FinalListingRiskClearance {
    const subject = this.subject(input);
    const verified = this.verifier.verify({
      evidence: input.clearanceEvidence,
      expectedSubjectHash: subject.subjectHash,
      at: input.at,
    });
    if (!verified.valid) {
      throw this.error(
        'LISTING_RISK_CLEARANCE_INVALID',
        `The signed listing risk clearance is invalid: ${verified.reason}.`,
      );
    }
    const result = this.record(input.screeningResult);
    const hardGateReasons = result.hardGateReasons;
    if (
      result.listingSubjectHash !== subject.subjectHash ||
      result.decision !== 'PASS' ||
      result.screeningStatus !== 'CLEARED' ||
      result.evidenceStatus !== 'ATTESTED' ||
      result.publishable !== true ||
      !Array.isArray(hardGateReasons) ||
      hardGateReasons.length !== 0 ||
      !/^[a-f0-9]{64}$/.test(input.mcpManifestHash) ||
      !/^[a-f0-9]{64}$/.test(input.mcpExecutableHash)
    ) {
      throw this.error(
        'LISTING_RISK_SCREENING_BLOCKED',
        'The trusted risk tool did not return an exact, fully cleared PASS for this listing subject.',
      );
    }
    const { attestation } = verified.proof;
    return {
      schemaVersion: FINAL_LISTING_RISK_CLEARANCE_VERSION,
      subjectVersion: LISTING_RISK_SUBJECT_VERSION,
      subjectHash: subject.subjectHash,
      subject: subject.subject,
      evidenceHash: verified.proof.evidenceHash,
      provider: attestation.provider,
      ruleset: attestation.ruleset,
      fetchedAt: attestation.fetchedAt,
      expiresAt: attestation.expiresAt,
      clearanceEvidence: verified.proof,
      screening: {
        decision: 'PASS',
        screeningStatus: 'CLEARED',
        evidenceStatus: 'ATTESTED',
        publishable: true,
        hardGateReasons: [],
        mcpManifestHash: input.mcpManifestHash,
        mcpExecutableHash: input.mcpExecutableHash,
        checkedAt: input.at.toISOString(),
      },
    };
  }

  requireStored(input: {
    organizationId: string;
    listingDraftId: string;
    bundle: ListingBundleV1;
    value: unknown;
    at: Date;
  }): FinalListingRiskClearance {
    const stored = this.record(input.value);
    const subject = this.subject(input);
    const verified = this.verifier.verify({
      evidence: stored.clearanceEvidence,
      expectedSubjectHash: subject.subjectHash,
      at: input.at,
    });
    const screening = this.record(stored.screening);
    if (
      stored.schemaVersion !== FINAL_LISTING_RISK_CLEARANCE_VERSION ||
      stored.subjectVersion !== LISTING_RISK_SUBJECT_VERSION ||
      !verified.valid ||
      stored.subjectHash !== subject.subjectHash ||
      this.verifier.subjectHash(this.record(stored.subject)) !==
        subject.subjectHash ||
      stored.evidenceHash !==
        (verified.valid ? verified.proof.evidenceHash : null) ||
      stored.provider !==
        (verified.valid ? verified.proof.attestation.provider : null) ||
      stored.ruleset !==
        (verified.valid ? verified.proof.attestation.ruleset : null) ||
      stored.fetchedAt !==
        (verified.valid ? verified.proof.attestation.fetchedAt : null) ||
      stored.expiresAt !==
        (verified.valid ? verified.proof.attestation.expiresAt : null) ||
      screening.decision !== 'PASS' ||
      screening.screeningStatus !== 'CLEARED' ||
      screening.evidenceStatus !== 'ATTESTED' ||
      screening.publishable !== true ||
      !Array.isArray(screening.hardGateReasons) ||
      screening.hardGateReasons.length !== 0 ||
      !/^[a-f0-9]{64}$/.test(this.text(screening.mcpManifestHash)) ||
      !/^[a-f0-9]{64}$/.test(this.text(screening.mcpExecutableHash))
    ) {
      throw this.error(
        'LISTING_RISK_CLEARANCE_REQUIRED',
        'The final reviewed listing has no fresh signed risk clearance bound to its exact text, attributes, platform, and image hashes.',
      );
    }
    return stored as unknown as FinalListingRiskClearance;
  }

  private error(code: string, message: string) {
    return new UnprocessableEntityException({ code, message });
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }
}

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const SUBJECT_HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const SIGNATURE_PATTERN = /^hmac-sha256:([a-f0-9]{64})$/;
const TIMEZONE_SUFFIX_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/;
const DEFAULT_MAX_AGE_SECONDS = 86_400;
const DEFAULT_CLOCK_SKEW_SECONDS = 300;

export const RISK_CLEARANCE_SCHEMA_VERSION =
  'risk-clearance-evidence/v1' as const;
export const LISTING_RISK_SUBJECT_VERSION = 'listing-risk-subject/v1' as const;

export interface ListingRiskSubject {
  title?: string;
  description?: string;
  tags?: unknown;
  profile?: {
    category?: unknown;
    materials?: unknown;
    productName?: unknown;
  } | null;
  competitionLevel?: string;
  platform?: string;
  scopeId?: string;
  bullets?: unknown;
  keywords?: unknown;
  attributes?: unknown;
  imageHashes?: unknown;
}

export interface RiskClearanceAttestation {
  provider: string;
  ruleset: string;
  evidenceRef: string;
  fetchedAt: string;
  expiresAt: string;
  subjectHash: string;
  passed: boolean;
  signature: string;
}

export interface VerifiedRiskClearance {
  schemaVersion: typeof RISK_CLEARANCE_SCHEMA_VERSION;
  subjectVersion: typeof LISTING_RISK_SUBJECT_VERSION;
  attestation: RiskClearanceAttestation;
  evidenceHash: string;
}

export type RiskClearanceVerification =
  | { valid: true; proof: VerifiedRiskClearance }
  | {
      valid: false;
      reason:
        | 'CONFIG_MISSING'
        | 'MALFORMED'
        | 'PROVIDER_UNAUTHORIZED'
        | 'SIGNATURE_INVALID'
        | 'SUBJECT_MISMATCH'
        | 'STALE'
        | 'REJECTED';
    };

@Injectable()
export class RiskClearanceVerifierService {
  constructor(private readonly config: ConfigService) {}

  subjectHash(subject: ListingRiskSubject): string {
    const profile = this.record(subject.profile);
    const payload = {
      attributes: this.canonicalAttributes(subject.attributes ?? {}),
      bullets: this.stringList(subject.bullets),
      competitionLevel: this.text(subject.competitionLevel),
      description: this.text(subject.description),
      imageHashes: this.stringList(subject.imageHashes, true),
      keywords: this.stringList(subject.keywords),
      platform: this.text(subject.platform).toLowerCase(),
      profile: {
        category: this.text(profile.category),
        materials: this.text(profile.materials),
        productName: this.text(profile.productName),
      },
      scopeId: this.text(subject.scopeId),
      tags: this.stringList(subject.tags, true),
      title: this.text(subject.title),
    };
    return `sha256:${this.sha256(this.canonicalJson(payload))}`;
  }

  verify(input: {
    evidence: unknown;
    expectedSubjectHash: string;
    at: Date;
  }): RiskClearanceVerification {
    const attestation = this.normalize(input.evidence);
    if (!attestation) return { valid: false, reason: 'MALFORMED' };
    const secret = this.config
      .get<string>('RISK_CLEARANCE_ATTESTATION_SECRET', '')
      .trim();
    const authorizedProviders = new Set(
      this.config
        .get<string>('RISK_CLEARANCE_AUTHORIZED_PROVIDERS', '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    );
    if (secret.length < 32 || authorizedProviders.size === 0) {
      return { valid: false, reason: 'CONFIG_MISSING' };
    }
    if (!authorizedProviders.has(attestation.provider.toLowerCase())) {
      return { valid: false, reason: 'PROVIDER_UNAUTHORIZED' };
    }
    if (!this.validSignature(attestation, secret)) {
      return { valid: false, reason: 'SIGNATURE_INVALID' };
    }
    if (
      !this.constantTimeEqual(
        attestation.subjectHash.toLowerCase(),
        input.expectedSubjectHash.toLowerCase(),
      )
    ) {
      return { valid: false, reason: 'SUBJECT_MISMATCH' };
    }
    if (!attestation.passed) return { valid: false, reason: 'REJECTED' };
    const fetchedAt = this.zonedDate(attestation.fetchedAt);
    const expiresAt = this.zonedDate(attestation.expiresAt);
    const maxAgeSeconds = this.positiveInteger(
      this.config.get('RISK_CLEARANCE_MAX_AGE_SECONDS'),
      DEFAULT_MAX_AGE_SECONDS,
    );
    const clockSkewSeconds = this.positiveInteger(
      this.config.get('RISK_CLEARANCE_CLOCK_SKEW_SECONDS'),
      DEFAULT_CLOCK_SKEW_SECONDS,
    );
    if (
      !fetchedAt ||
      !expiresAt ||
      expiresAt.getTime() <= fetchedAt.getTime() ||
      fetchedAt.getTime() > input.at.getTime() + clockSkewSeconds * 1000 ||
      input.at.getTime() >= expiresAt.getTime() ||
      input.at.getTime() - fetchedAt.getTime() > maxAgeSeconds * 1000
    ) {
      return { valid: false, reason: 'STALE' };
    }
    return {
      valid: true,
      proof: {
        schemaVersion: RISK_CLEARANCE_SCHEMA_VERSION,
        subjectVersion: LISTING_RISK_SUBJECT_VERSION,
        attestation,
        evidenceHash: this.sha256(this.canonicalJson(attestation)),
      },
    };
  }

  private normalize(value: unknown): RiskClearanceAttestation | null {
    const envelope = this.record(value);
    if (
      envelope.schemaVersion !== RISK_CLEARANCE_SCHEMA_VERSION ||
      envelope.subjectVersion !== LISTING_RISK_SUBJECT_VERSION
    ) {
      return null;
    }
    const source = this.record(envelope.attestation);
    const provider = this.text(source.provider);
    const ruleset = this.text(source.ruleset);
    const evidenceRef = this.text(source.evidenceRef);
    const fetchedAt = this.text(source.fetchedAt);
    const expiresAt = this.text(source.expiresAt);
    const subjectHash = this.text(source.subjectHash).toLowerCase();
    const signature = this.text(source.signature).toLowerCase();
    if (
      !provider ||
      !ruleset ||
      !evidenceRef ||
      !fetchedAt ||
      !expiresAt ||
      !SUBJECT_HASH_PATTERN.test(subjectHash) ||
      !SIGNATURE_PATTERN.test(signature) ||
      typeof source.passed !== 'boolean' ||
      !this.zonedDate(fetchedAt) ||
      !this.zonedDate(expiresAt)
    ) {
      return null;
    }
    return {
      provider,
      ruleset,
      evidenceRef,
      fetchedAt,
      expiresAt,
      subjectHash,
      passed: source.passed,
      signature,
    };
  }

  private validSignature(
    attestation: RiskClearanceAttestation,
    secret: string,
  ): boolean {
    const match = SIGNATURE_PATTERN.exec(attestation.signature);
    if (!match) return false;
    const payload = {
      provider: attestation.provider,
      ruleset: attestation.ruleset,
      evidenceRef: attestation.evidenceRef,
      fetchedAt: attestation.fetchedAt,
      expiresAt: attestation.expiresAt,
      subjectHash: attestation.subjectHash,
      passed: attestation.passed,
    };
    const expected = createHmac('sha256', secret)
      .update(this.canonicalJson(payload))
      .digest();
    const supplied = Buffer.from(match[1], 'hex');
    return (
      supplied.length === expected.length && timingSafeEqual(supplied, expected)
    );
  }

  private constantTimeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, 'utf8');
    const rightBuffer = Buffer.from(right, 'utf8');
    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }

  private zonedDate(value: string): Date | null {
    if (!TIMEZONE_SUFFIX_PATTERN.test(value)) return null;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? new Date(timestamp) : null;
  }

  private positiveInteger(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private canonicalAttributes(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.canonicalAttributes(item));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => this.compare(left, right))
          .map(([key, item]) => [key, this.canonicalAttributes(item)]),
      );
    }
    if (
      value === null ||
      ['string', 'number', 'boolean'].includes(typeof value)
    ) {
      return value;
    }
    return this.scalarText(value);
  }

  private stringList(value: unknown, sortValues = false): string[] {
    const values = (Array.isArray(value) ? value : [value])
      .map((item) => this.scalarText(item))
      .filter(Boolean);
    return sortValues
      ? [...new Set(values)].sort((left, right) => this.compare(left, right))
      : values;
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

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private text(value: unknown): string {
    return this.scalarText(value);
  }

  private scalarText(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value.toString();
    }
    if (typeof value === 'boolean' || typeof value === 'bigint') {
      return value.toString();
    }
    if (typeof value === 'symbol') return value.description?.trim() ?? '';
    return '';
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private compare(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
  }
}

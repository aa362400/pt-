import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { semanticConceptKey } from './semantic-concept-key.js';

export interface NormalizationInput {
  name: string;
  productType: string;
  identityKey?: string | null;
  material?: string | null;
  primaryUse?: string | null;
  customizationMethod?: string | null;
}

export interface NormalizedProduct extends NormalizationInput {
  canonicalName: string;
  productType: string;
  material: string | null;
  primaryUse: string | null;
  customizationMethod: string | null;
  fingerprint: string;
  conceptKey: string;
}

export interface EvidenceIdentityInput {
  source: string;
  externalId?: string | null;
  evidenceGroupKey?: string | null;
}

const PHRASE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bpersonalized\b/gi, 'custom'],
  [/\bpersonalised\b/gi, 'custom'],
  [/\bwooden\b/gi, 'wood'],
  [/\blaser[- ]engraved\b/gi, 'laser engraving'],
  [/\bpens\b/gi, 'pen'],
  [/\bbags\b/gi, 'bag'],
  [/\bholders\b/gi, 'holder'],
  [/\borganizers\b/gi, 'organizer'],
  [/\bclips\b/gi, 'clip'],
  [/\btags\b/gi, 'tag'],
  [/\bpouches\b/gi, 'pouch'],
  [/\bdividers\b/gi, 'divider'],
  [/\bcovers\b/gi, 'cover'],
  [/\bhooks\b/gi, 'hook'],
  [/\bproducts\b/gi, 'product'],
];

@Injectable()
export class NormalizationService {
  evidenceIdentityKey(input: EvidenceIdentityInput): string | null {
    const evidenceGroupKey = this.nullableText(input.evidenceGroupKey);
    if (evidenceGroupKey) return evidenceGroupKey;
    const externalId = this.nullableText(input.externalId);
    return externalId ? `${input.source}:${externalId}` : null;
  }

  normalize(input: NormalizationInput): NormalizedProduct {
    const productType = this.normalizeText(input.productType, true);
    const material = this.nullableText(input.material);
    const primaryUse = this.nullableText(input.primaryUse);
    const customizationMethod = this.nullableText(input.customizationMethod);
    const identityKey = this.nullableText(input.identityKey);
    const canonicalName = this.normalizeText(input.name, true);
    const fingerprintBasis = [
      identityKey ?? canonicalName,
      productType,
      material ?? 'unknown-material',
      primaryUse ?? 'unknown-use',
      customizationMethod ?? 'no-customization',
    ].join('|');

    return {
      ...input,
      canonicalName,
      productType,
      material,
      primaryUse,
      customizationMethod,
      // The cross-runtime history key is computed from the raw product words.
      // Canonical-name phrase rewrites remain fingerprint-only so the Python
      // discovery Agent and TypeScript backend produce identical keys.
      conceptKey: semanticConceptKey(input.name, input.productType),
      fingerprint: createHash('sha256').update(fingerprintBasis).digest('hex'),
    };
  }

  semanticConceptKey(name: string, productType: string): string {
    return semanticConceptKey(name, productType);
  }

  private nullableText(value?: string | null): string | null {
    if (typeof value !== 'string' || value.trim().length === 0) return null;
    return this.normalizeText(value, true);
  }

  private normalizeText(value: string, singularize: boolean): string {
    let normalized = value.normalize('NFKC').toLowerCase();
    for (const [pattern, replacement] of PHRASE_REPLACEMENTS) {
      normalized = normalized.replace(pattern, replacement);
    }
    normalized = normalized
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .replace(/\s+/g, ' ');
    if (singularize && normalized.endsWith('s') && normalized.length > 3) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  }
}

import { Injectable } from '@nestjs/common';

export interface KeywordExpansionInput {
  canonicalName: string;
  productType: string;
  material: string | null;
  primaryUse: string | null;
  customizationMethod: string | null;
  targetAudience: string | null;
  forbiddenTerms?: string[];
}

@Injectable()
export class KeywordExpansionService {
  expand(input: KeywordExpansionInput) {
    const forbidden = new Set(
      (input.forbiddenTerms ?? [])
        .map((term) => term.trim().toLowerCase())
        .filter(Boolean),
    );
    const seeds = [
      input.canonicalName,
      input.productType,
      [input.material, input.productType].filter(Boolean).join(' '),
      [input.customizationMethod, input.productType].filter(Boolean).join(' '),
      [input.productType, input.primaryUse].filter(Boolean).join(' for '),
      [input.productType, input.targetAudience].filter(Boolean).join(' for '),
    ];
    const keywords = [
      ...new Set(seeds.map((value) => this.clean(value)).filter(Boolean)),
    ]
      .filter((value) => ![...forbidden].some((term) => value.includes(term)))
      .slice(0, 50);
    return {
      core: keywords.slice(0, 10),
      longTail: keywords.slice(10),
      negative: [...forbidden].slice(0, 50),
      generationMethod: 'deterministic_structured_fields',
    };
  }

  private clean(value: string | null): string {
    return (value ?? '')
      .normalize('NFKC')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 120);
  }
}

import { Injectable } from '@nestjs/common';
import {
  CanonicalCatalogService,
  type LocalProductRecord,
} from '../marketplace-compiler/canonical-catalog.service.js';
import {
  MarketplaceCompilerService,
  type OzonCompilationResult,
} from '../marketplace-compiler/marketplace-compiler.service.js';
import type { OzonProductImportInput } from './ozon-seller-api.client.js';

export type OzonPublishPolicyEvaluation =
  | {
      decision: 'ALLOW';
      payload: OzonProductImportInput;
      evidence: Record<string, unknown>;
    }
  | {
      decision: 'BLOCK';
      code: 'OZON_IMPORT_CONFIGURATION_INCOMPLETE';
      message: string;
      evidence: Record<string, unknown>;
    };

/** Business eligibility policy. This service never calls Ozon. */
@Injectable()
export class OzonPublishPolicyService {
  constructor(
    private readonly catalog: CanonicalCatalogService,
    private readonly compiler: MarketplaceCompilerService,
  ) {}

  evaluateProduct(
    product: LocalProductRecord,
    mode: 'PREFLIGHT' | 'PUBLISH',
  ): OzonPublishPolicyEvaluation {
    const compilation = this.compiler.compileOzon(
      this.catalog.fromLocalProduct(product),
      { mode },
    );
    const evidence = this.compilationEvidence(compilation);
    if (compilation.status === 'INVALID') {
      return {
        decision: 'BLOCK',
        code: 'OZON_IMPORT_CONFIGURATION_INCOMPLETE',
        message: `Ozon 上架资料未通过内部校验：${compilation.errors
          .map((issue) => issue.message)
          .join('；')}`,
        evidence,
      };
    }
    return {
      decision: 'ALLOW',
      payload: compilation.payload,
      evidence,
    };
  }

  isActiveExternalStatus(status?: string): boolean {
    const normalized = status?.trim().toLowerCase();
    return normalized === 'active' || normalized === 'in_sale';
  }

  private compilationEvidence(compilation: OzonCompilationResult) {
    return {
      status: compilation.status,
      target: compilation.target,
      schemaVersion: compilation.schemaVersion,
      errors: compilation.errors,
      warnings: compilation.warnings,
      provenance: compilation.provenance,
    };
  }
}

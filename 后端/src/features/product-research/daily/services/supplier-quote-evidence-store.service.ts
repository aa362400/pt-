import { createHash } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import {
  expectedSupplierPurchaseSchema,
  supplierQuoteEvidenceSchema,
  type ExpectedSupplierPurchase,
  type SupplierQuoteEvidence,
} from '../contracts/supplier-quote.contract.js';
import { TenantDatabaseContextService } from '../../../../shared/database/tenant-database-context.service.js';

const CANONICALIZER_VERSION = 'supplier-evidence-jcs/v1';

export interface AppendSupplierQuoteEvidenceInput {
  organizationId: string;
  workspaceId: string | null;
  researchRunId: string;
  candidateId: string;
  evidence: SupplierQuoteEvidence;
  expectedBinding: ExpectedSupplierPurchase;
  rawSnapshotRef?: string;
}

@Injectable()
export class SupplierQuoteEvidenceStoreService {
  constructor(private readonly tenantDatabase: TenantDatabaseContextService) {}

  async append(input: AppendSupplierQuoteEvidenceInput): Promise<{
    id: string;
    inserted: boolean;
    contentHash: string;
    dedupeKey: string;
  }> {
    const evidence = supplierQuoteEvidenceSchema.parse(input.evidence);
    const parsedExpectedBinding = expectedSupplierPurchaseSchema.parse(
      input.expectedBinding,
    );
    const expectedBinding = {
      ...parsedExpectedBinding,
      allowedEvidenceHosts: [
        ...new Set(parsedExpectedBinding.allowedEvidenceHosts),
      ].sort((left, right) => this.compareCodePoints(left, right)),
    };
    const workspaceScopeKey = this.workspaceScopeKey(input.workspaceId);
    const rawSnapshotRef = this.rawSnapshotRef(
      input.rawSnapshotRef,
      input.organizationId,
      evidence.rawSnapshotSha256,
      evidence.verification.status,
    );
    const contentHash = this.sha256(
      this.canonicalJson({
        canonicalizerVersion: CANONICALIZER_VERSION,
        evidence,
        expectedBinding,
      }),
    );
    const dedupeKey = this.sha256(
      [
        CANONICALIZER_VERSION,
        evidence.schemaVersion,
        workspaceScopeKey,
        input.researchRunId,
        input.candidateId,
        evidence.source.provider,
        evidence.adapterVersion,
        evidence.requestId,
        contentHash,
      ].join('|'),
    );

    return this.tenantDatabase.run(input.organizationId, async (tx) => {
      const candidate = await tx.productCandidate.findFirst({
        where: {
          id: input.candidateId,
          organizationId: input.organizationId,
          researchRunId: input.researchRunId,
          workspaceId: input.workspaceId,
        },
        select: { id: true },
      });
      if (!candidate) {
        throw new ConflictException(
          'SUPPLIER_QUOTE_CANDIDATE_BINDING_MISMATCH',
        );
      }

      const discovery = evidence.discovery;
      const price = evidence.offer.price;
      const result = await tx.supplierQuoteEvidence.createMany({
        data: [
          {
            organizationId: input.organizationId,
            workspaceId: input.workspaceId,
            workspaceScopeKey,
            researchRunId: input.researchRunId,
            candidateId: input.candidateId,
            schemaVersion: evidence.schemaVersion,
            provider: evidence.source.provider,
            adapterVersion: evidence.adapterVersion,
            requestId: evidence.requestId,
            evidenceGroupKey: evidence.evidenceGroupKey,
            discoveryMethod: discovery.method,
            matchStatus: evidence.match.status,
            verificationStatus: evidence.verification.status,
            sourceOriginalSha256:
              discovery.method === 'IMAGE_SEARCH'
                ? discovery.sourceOriginalSha256
                : null,
            sourceCanonicalSha256:
              discovery.method === 'IMAGE_SEARCH'
                ? discovery.sourceCanonicalSha256
                : null,
            offerCanonicalSha256:
              discovery.method === 'IMAGE_SEARCH'
                ? discovery.offerCanonicalSha256
                : null,
            offerId: evidence.offer.offerId,
            offerUrl: evidence.offer.offerUrl,
            variantId: evidence.offer.variantId,
            variantAttributes: evidence.offer.variantAttributes,
            quantity: evidence.offer.quantity,
            minimumOrderQuantity: evidence.offer.minimumOrderQuantity,
            unitOfMeasure: evidence.offer.unitOfMeasure,
            unitsPerPack: evidence.offer.unitsPerPack,
            priceKind: price.kind,
            productUnitAmount: price.kind === 'EXACT' ? price.unitAmount : null,
            productTotalAmount:
              price.kind === 'EXACT' ? price.totalAmount : null,
            displayMinimumAmount:
              price.kind === 'DISPLAY_RANGE' ? price.minimumAmount : null,
            displayMaximumAmount:
              price.kind === 'DISPLAY_RANGE' ? price.maximumAmount : null,
            productCurrency: price.currency,
            shippingQuoteId: evidence.shipping.quoteId,
            shippingScope: evidence.shipping.scope,
            shippingDestinationCountry: evidence.shipping.destinationCountry,
            shippingDestinationPostalCode:
              evidence.shipping.destinationPostalCode,
            shippingQuantity: evidence.shipping.quantity,
            shippingUnitAmount: evidence.shipping.amountPerUnit,
            shippingTotalAmount: evidence.shipping.totalAmount,
            shippingCurrency: evidence.shipping.currency,
            shippingEvidenceUrl: evidence.shipping.evidenceUrl,
            attributeConflicts: evidence.match.attributeConflicts,
            expectedBinding,
            normalizedEvidence: evidence,
            rawSnapshotSha256: evidence.rawSnapshotSha256,
            rawSnapshotRef,
            contentHash,
            dedupeKey,
            fetchedAt: new Date(evidence.source.fetchedAt),
            verifiedAt: new Date(evidence.verification.verifiedAt),
            validUntil: new Date(evidence.verification.validUntil),
          },
        ],
        skipDuplicates: true,
      });
      const stored = await tx.supplierQuoteEvidence.findUnique({
        where: {
          organizationId_workspaceScopeKey_provider_requestId: {
            organizationId: input.organizationId,
            workspaceScopeKey,
            provider: evidence.source.provider,
            requestId: evidence.requestId,
          },
        },
        select: { id: true, contentHash: true },
      });
      if (!stored) {
        throw new ConflictException('SUPPLIER_QUOTE_EVIDENCE_APPEND_FAILED');
      }
      if (stored.contentHash !== contentHash) {
        throw new ConflictException(
          'SUPPLIER_QUOTE_REQUEST_ID_REUSED_WITH_DIFFERENT_CONTENT',
        );
      }
      return {
        id: stored.id,
        inserted: result.count === 1,
        contentHash,
        dedupeKey,
      };
    });
  }

  private rawSnapshotRef(
    value: string | undefined,
    organizationId: string,
    rawSnapshotSha256: string,
    verificationStatus: SupplierQuoteEvidence['verification']['status'],
  ): string | null {
    if (value === undefined) {
      if (verificationStatus === 'VERIFIED') {
        throw new ConflictException('SUPPLIER_QUOTE_RAW_SNAPSHOT_REF_REQUIRED');
      }
      return null;
    }
    const normalized = value.trim();
    const expected = `supplier-quotes/${organizationId}/raw/${rawSnapshotSha256}`;
    if (normalized !== expected) {
      throw new ConflictException('SUPPLIER_QUOTE_RAW_SNAPSHOT_REF_INVALID');
    }
    return normalized;
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
          .sort(([left], [right]) => this.compareCodePoints(left, right))
          .map(([key, item]) => [key, this.canonicalValue(item)]),
      );
    }
    return value;
  }

  private compareCodePoints(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
  }
}

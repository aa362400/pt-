CREATE TABLE "supplier_quote_evidence" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "researchRunId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "adapterVersion" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "evidenceGroupKey" TEXT NOT NULL,
    "discoveryMethod" TEXT NOT NULL,
    "matchStatus" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL,
    "sourceOriginalSha256" TEXT,
    "sourceCanonicalSha256" TEXT,
    "offerCanonicalSha256" TEXT,
    "offerId" TEXT NOT NULL,
    "offerUrl" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "variantAttributes" JSONB NOT NULL,
    "quantity" INTEGER NOT NULL,
    "minimumOrderQuantity" INTEGER NOT NULL,
    "unitOfMeasure" TEXT NOT NULL,
    "unitsPerPack" INTEGER NOT NULL,
    "priceKind" TEXT NOT NULL,
    "productUnitAmount" DECIMAL(18,4),
    "productTotalAmount" DECIMAL(18,4),
    "displayMinimumAmount" DECIMAL(18,4),
    "displayMaximumAmount" DECIMAL(18,4),
    "productCurrency" TEXT NOT NULL,
    "shippingQuoteId" TEXT NOT NULL,
    "shippingScope" TEXT NOT NULL,
    "shippingDestinationCountry" TEXT NOT NULL,
    "shippingDestinationPostalCode" TEXT NOT NULL,
    "shippingQuantity" INTEGER NOT NULL,
    "shippingUnitAmount" DECIMAL(18,4) NOT NULL,
    "shippingTotalAmount" DECIMAL(18,4) NOT NULL,
    "shippingCurrency" TEXT NOT NULL,
    "shippingEvidenceUrl" TEXT NOT NULL,
    "attributeConflicts" JSONB NOT NULL,
    "expectedBinding" JSONB NOT NULL,
    "normalizedEvidence" JSONB NOT NULL,
    "rawSnapshotSha256" TEXT NOT NULL,
    "rawSnapshotRef" TEXT,
    "contentHash" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_quote_evidence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "supplier_quote_evidence_quantity_check" CHECK (
      "quantity" > 0 AND "minimumOrderQuantity" > 0 AND
      "unitsPerPack" > 0 AND "shippingQuantity" > 0 AND
      "quantity" <= 1000000 AND "minimumOrderQuantity" <= 1000000 AND
      "unitsPerPack" <= 1000000 AND "shippingQuantity" <= 1000000
    ),
    CONSTRAINT "supplier_quote_evidence_amount_check" CHECK (
      "shippingUnitAmount" > 0 AND "shippingTotalAmount" > 0 AND
      ("productUnitAmount" IS NULL OR "productUnitAmount" > 0) AND
      ("productTotalAmount" IS NULL OR "productTotalAmount" > 0) AND
      ("displayMinimumAmount" IS NULL OR "displayMinimumAmount" > 0) AND
      ("displayMaximumAmount" IS NULL OR "displayMaximumAmount" > 0)
    ),
    CONSTRAINT "supplier_quote_evidence_price_shape_check" CHECK (
      ("priceKind" = 'EXACT' AND
       "productUnitAmount" IS NOT NULL AND "productTotalAmount" IS NOT NULL AND
       "displayMinimumAmount" IS NULL AND "displayMaximumAmount" IS NULL)
      OR
      ("priceKind" = 'DISPLAY_RANGE' AND
       "productUnitAmount" IS NULL AND "productTotalAmount" IS NULL AND
       "displayMinimumAmount" IS NOT NULL AND "displayMaximumAmount" IS NOT NULL AND
       "displayMaximumAmount" >= "displayMinimumAmount")
    ),
    CONSTRAINT "supplier_quote_evidence_time_chain_check" CHECK (
      "fetchedAt" <= "verifiedAt" AND "verifiedAt" < "validUntil"
    ),
    CONSTRAINT "supplier_quote_evidence_hashes_check" CHECK (
      "rawSnapshotSha256" ~ '^[a-f0-9]{64}$' AND
      "contentHash" ~ '^[a-f0-9]{64}$' AND
      "dedupeKey" ~ '^[a-f0-9]{64}$'
    ),
    CONSTRAINT "supplier_quote_evidence_enums_check" CHECK (
      "discoveryMethod" IN ('IMAGE_SEARCH', 'KEYWORD_SEARCH') AND
      "matchStatus" IN ('MATCHED', 'NEEDS_REVIEW', 'REJECTED', 'UNMATCHED') AND
      "verificationStatus" IN ('VERIFIED', 'UNVERIFIED') AND
      "shippingScope" IN ('DOMESTIC_ONLY', 'CROSS_BORDER_ONLY', 'LANDED', 'LANDED_RU') AND
      "unitOfMeasure" IN ('PIECE', 'SET', 'PACK')
    ),
    CONSTRAINT "supplier_quote_evidence_currency_check" CHECK (
      "productCurrency" ~ '^[A-Z]{3}$' AND "shippingCurrency" ~ '^[A-Z]{3}$'
    ),
    CONSTRAINT "supplier_quote_evidence_discovery_hash_check" CHECK (
      ("discoveryMethod" = 'IMAGE_SEARCH' AND
       "sourceOriginalSha256" ~ '^[a-f0-9]{64}$' AND
       "sourceCanonicalSha256" ~ '^[a-f0-9]{64}$' AND
       "offerCanonicalSha256" ~ '^[a-f0-9]{64}$')
      OR
      ("discoveryMethod" = 'KEYWORD_SEARCH' AND
       "sourceOriginalSha256" IS NULL AND
       "sourceCanonicalSha256" IS NULL AND
       "offerCanonicalSha256" IS NULL)
    ),
    CONSTRAINT "supplier_quote_evidence_json_shape_check" CHECK (
      jsonb_typeof("variantAttributes") = 'object' AND
      jsonb_typeof("attributeConflicts") = 'array' AND
      jsonb_typeof("expectedBinding") = 'object' AND
      jsonb_typeof("normalizedEvidence") = 'object'
    )
);

CREATE UNIQUE INDEX "supplier_quote_evidence_organizationId_dedupeKey_key"
ON "supplier_quote_evidence"("organizationId", "dedupeKey");
CREATE UNIQUE INDEX "supplier_quote_evidence_organizationId_provider_requestId_key"
ON "supplier_quote_evidence"("organizationId", "provider", "requestId");
CREATE INDEX "supplier_quote_evidence_researchRunId_candidateId_idx"
ON "supplier_quote_evidence"("researchRunId", "candidateId");
CREATE INDEX "supplier_quote_evidence_candidateId_verificationStatus_validUntil_idx"
ON "supplier_quote_evidence"("candidateId", "verificationStatus", "validUntil");
CREATE INDEX "supplier_quote_evidence_organizationId_evidenceGroupKey_createdAt_idx"
ON "supplier_quote_evidence"("organizationId", "evidenceGroupKey", "createdAt");

ALTER TABLE "supplier_quote_evidence"
ADD CONSTRAINT "supplier_quote_evidence_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_quote_evidence"
ADD CONSTRAINT "supplier_quote_evidence_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_quote_evidence"
ADD CONSTRAINT "supplier_quote_evidence_researchRunId_fkey"
FOREIGN KEY ("researchRunId") REFERENCES "product_research_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_quote_evidence"
ADD CONSTRAINT "supplier_quote_evidence_candidateId_fkey"
FOREIGN KEY ("candidateId") REFERENCES "product_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "reject_supplier_quote_evidence_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'supplier_quote_evidence is append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "supplier_quote_evidence_immutable_guard"
BEFORE UPDATE OR DELETE ON "supplier_quote_evidence"
FOR EACH ROW
EXECUTE FUNCTION "reject_supplier_quote_evidence_mutation"();

ALTER TABLE "supplier_quote_evidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_quote_evidence" FORCE ROW LEVEL SECURITY;

CREATE POLICY "supplier_quote_evidence_select"
ON "supplier_quote_evidence"
FOR SELECT
USING (
  "organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')
);

CREATE POLICY "supplier_quote_evidence_insert"
ON "supplier_quote_evidence"
FOR INSERT
WITH CHECK (
  "organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')
  AND EXISTS (
    SELECT 1
    FROM "product_candidates" AS candidate
    WHERE candidate."id" = "supplier_quote_evidence"."candidateId"
      AND candidate."organizationId" = "supplier_quote_evidence"."organizationId"
      AND candidate."researchRunId" = "supplier_quote_evidence"."researchRunId"
      AND candidate."workspaceId" IS NOT DISTINCT FROM "supplier_quote_evidence"."workspaceId"
  )
  AND EXISTS (
    SELECT 1
    FROM "product_research_runs" AS research_run
    WHERE research_run."id" = "supplier_quote_evidence"."researchRunId"
      AND research_run."organizationId" = "supplier_quote_evidence"."organizationId"
      AND research_run."workspaceId" IS NOT DISTINCT FROM "supplier_quote_evidence"."workspaceId"
  )
  AND (
    "supplier_quote_evidence"."workspaceId" IS NULL
    OR EXISTS (
      SELECT 1
      FROM "workspaces" AS workspace
      WHERE workspace."id" = "supplier_quote_evidence"."workspaceId"
        AND workspace."organizationId" = "supplier_quote_evidence"."organizationId"
    )
  )
);

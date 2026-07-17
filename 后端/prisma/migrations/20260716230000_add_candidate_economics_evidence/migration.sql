-- Add the immutable evidence chain used by fail-closed candidate economics.
-- This migration is intentionally additive: it does not attempt to reconcile
-- unrelated drift between the live database and schema.prisma.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE "candidate_economics_evidence" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "workspaceScopeKey" TEXT NOT NULL,
  "researchRunId" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "schemaVersion" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "valueKind" TEXT NOT NULL,
  "amount" DECIMAL(18,4),
  "rate" DECIMAL(18,8),
  "minimumAmount" DECIMAL(18,4),
  "currency" TEXT,
  "baseCurrency" TEXT,
  "quoteCurrency" TEXT,
  "quantity" DECIMAL(18,4),
  "unit" TEXT,
  "provider" TEXT NOT NULL,
  "adapterVersion" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "verificationMethod" TEXT NOT NULL,
  "verificationStatus" TEXT NOT NULL,
  "binding" JSONB NOT NULL,
  "bindingHash" TEXT NOT NULL,
  "normalizedEvidence" JSONB NOT NULL,
  "rawSnapshotSha256" TEXT NOT NULL,
  "rawSnapshotRef" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3) NOT NULL,
  "validUntil" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "candidate_economics_evidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "candidate_economics_evidence_contract_check" CHECK (
    "schemaVersion" = 'candidate-economics-evidence/v1'
    AND "kind" IN (
      'SALE_PRICE', 'DOMESTIC_TRANSPORT', 'PACKAGING', 'OZON_COMMISSION',
      'OZON_PAYMENT', 'OZON_FULFILLMENT', 'OZON_STORAGE', 'ADVERTISING',
      'REFUND_LOSS', 'TAX', 'FX_RATE', 'FX_VOLATILITY_RESERVE'
    )
    AND "valueKind" IN ('MONEY', 'RATE', 'RATE_WITH_MINIMUM', 'FX')
    AND "verificationStatus" = 'VERIFIED'
    AND char_length("provider") BETWEEN 1 AND 120
    AND char_length("adapterVersion") BETWEEN 1 AND 120
    AND char_length("requestId") BETWEEN 1 AND 256
    AND char_length("verificationMethod") BETWEEN 1 AND 120
    AND "bindingHash" ~ '^[a-f0-9]{64}$'
    AND "rawSnapshotSha256" ~ '^[a-f0-9]{64}$'
    AND "contentHash" ~ '^[a-f0-9]{64}$'
    AND "dedupeKey" ~ '^[a-f0-9]{64}$'
    AND "rawSnapshotRef" =
      'economics-evidence/' || "organizationId" || '/raw/' || "rawSnapshotSha256"
    AND jsonb_typeof("binding") = 'object'
    AND jsonb_typeof("normalizedEvidence") = 'object'
    AND ("currency" IS NULL OR "currency" ~ '^[A-Z]{3}$')
    AND ("baseCurrency" IS NULL OR "baseCurrency" ~ '^[A-Z]{3}$')
    AND ("quoteCurrency" IS NULL OR "quoteCurrency" ~ '^[A-Z]{3}$')
    AND ("amount" IS NULL OR "amount" >= 0)
    AND ("minimumAmount" IS NULL OR "minimumAmount" >= 0)
    AND ("quantity" IS NULL OR "quantity" > 0)
  ),
  CONSTRAINT "candidate_economics_evidence_value_shape_check" CHECK (
    ("valueKind" = 'MONEY' AND "amount" IS NOT NULL AND "currency" IS NOT NULL)
    OR ("valueKind" = 'RATE' AND "rate" BETWEEN 0 AND 1)
    OR (
      "valueKind" = 'RATE_WITH_MINIMUM'
      AND "rate" BETWEEN 0 AND 1
      AND "minimumAmount" IS NOT NULL
      AND "currency" IS NOT NULL
    )
    OR (
      "valueKind" = 'FX'
      AND "rate" > 0
      AND "baseCurrency" IS NOT NULL
      AND "quoteCurrency" IS NOT NULL
      AND "baseCurrency" <> "quoteCurrency"
    )
  ),
  CONSTRAINT "candidate_economics_evidence_time_chain_check" CHECK (
    "observedAt" <= "fetchedAt"
    AND "observedAt" <= "verifiedAt"
    AND "verifiedAt" < "validUntil"
  )
);

CREATE TABLE "candidate_economics_evaluations" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "workspaceScopeKey" TEXT NOT NULL,
  "researchRunId" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "supplierQuoteEvidenceId" TEXT,
  "schemaVersion" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL,
  "calculatorVersion" TEXT NOT NULL,
  "policySnapshot" JSONB NOT NULL,
  "policyHash" TEXT NOT NULL,
  "inputSetHash" TEXT NOT NULL,
  "rawSnapshotSetHash" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "salePrice" DECIMAL(18,4),
  "grossProfitBeforeAds" DECIMAL(18,4),
  "grossMarginBeforeAds" DECIMAL(18,8),
  "netProfitAfterAds" DECIMAL(18,4),
  "netMarginAfterAds" DECIMAL(18,8),
  "totalCost" DECIMAL(18,4),
  "componentBreakdown" JSONB NOT NULL,
  "hardGateReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "validFrom" TIMESTAMP(3) NOT NULL,
  "validUntil" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "candidate_economics_evaluations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "candidate_economics_evaluations_contract_check" CHECK (
    "schemaVersion" = 'candidate-economics-evaluation/v1'
    AND "policyVersion" = 'candidate-economics-policy/v1'
    AND "calculatorVersion" = 'candidate-economics-calculator/v1'
    AND "policyHash" ~ '^[a-f0-9]{64}$'
    AND "inputSetHash" ~ '^[a-f0-9]{64}$'
    AND "rawSnapshotSetHash" ~ '^[a-f0-9]{64}$'
    AND "contentHash" ~ '^[a-f0-9]{64}$'
    AND "dedupeKey" ~ '^[a-f0-9]{64}$'
    AND "currency" ~ '^[A-Z]{3}$'
    AND jsonb_typeof("policySnapshot") = 'object'
    AND jsonb_typeof("componentBreakdown") = 'object'
    AND "hardGateReasons" IS NOT NULL
    AND "validFrom" <= "validUntil"
  ),
  CONSTRAINT "candidate_economics_evaluations_result_shape_check" CHECK (
    (
      "status" = 'BLOCKED'
      AND "decision" = 'DATA_INSUFFICIENT'
      AND cardinality("hardGateReasons") > 0
      AND "salePrice" IS NULL
      AND "grossProfitBeforeAds" IS NULL
      AND "grossMarginBeforeAds" IS NULL
      AND "netProfitAfterAds" IS NULL
      AND "netMarginAfterAds" IS NULL
      AND "totalCost" IS NULL
    )
    OR (
      "status" = 'VERIFIED'
      AND "decision" IN ('PASS', 'REJECT')
      AND "supplierQuoteEvidenceId" IS NOT NULL
      AND "salePrice" > 0
      AND "grossProfitBeforeAds" IS NOT NULL
      AND "grossMarginBeforeAds" IS NOT NULL
      AND "netProfitAfterAds" IS NOT NULL
      AND "netMarginAfterAds" IS NOT NULL
      AND "totalCost" >= 0
      AND "validFrom" < "validUntil"
      AND (
        ("decision" = 'PASS' AND cardinality("hardGateReasons") = 0)
        OR ("decision" = 'REJECT' AND cardinality("hardGateReasons") > 0)
      )
    )
  )
);

CREATE TABLE "candidate_economics_evaluation_inputs" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "workspaceScopeKey" TEXT NOT NULL,
  "researchRunId" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "evaluationId" TEXT NOT NULL,
  "economicsEvidenceId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "evidenceContentHash" TEXT NOT NULL,
  "rawSnapshotSha256" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "candidate_economics_evaluation_inputs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "candidate_economics_evaluation_inputs_contract_check" CHECK (
    "role" IN (
      'SALE_PRICE', 'DOMESTIC_TRANSPORT', 'PACKAGING', 'OZON_COMMISSION',
      'OZON_PAYMENT', 'OZON_FULFILLMENT', 'OZON_STORAGE', 'ADVERTISING',
      'REFUND_LOSS', 'TAX', 'FX_RATE', 'FX_VOLATILITY_RESERVE'
    )
    AND "ordinal" >= 0
    AND "evidenceContentHash" ~ '^[a-f0-9]{64}$'
    AND "rawSnapshotSha256" ~ '^[a-f0-9]{64}$'
  )
);

ALTER TABLE "product_launches"
  ADD COLUMN "researchCandidateId" TEXT,
  ADD COLUMN "economicsEvaluationId" TEXT,
  ADD COLUMN "economicsEvaluationHash" TEXT;

ALTER TABLE "listing_publish_snapshots"
  ADD COLUMN "economicsEvaluationId" TEXT,
  ADD COLUMN "economicsEvaluationHash" TEXT,
  ADD COLUMN "economicsInputSetHash" TEXT,
  ADD COLUMN "economicsValidUntil" TIMESTAMP(3);

ALTER TABLE "external_submissions"
  ADD COLUMN "economicsEvaluationId" TEXT,
  ADD COLUMN "economicsEvaluationHash" TEXT;

CREATE INDEX "candidate_economics_evidence_researchRunId_candidateId_idx"
  ON "candidate_economics_evidence"("researchRunId", "candidateId");
CREATE INDEX "candidate_economics_evidence_candidateId_kind_verificationS_idx"
  ON "candidate_economics_evidence"("candidateId", "kind", "verificationStatus", "validUntil");
CREATE INDEX "candidate_economics_evidence_organizationId_provider_fetche_idx"
  ON "candidate_economics_evidence"("organizationId", "provider", "fetchedAt");
CREATE UNIQUE INDEX "candidate_econ_evidence_scope_dedupe_key"
  ON "candidate_economics_evidence"("organizationId", "workspaceScopeKey", "dedupeKey");
CREATE UNIQUE INDEX "candidate_econ_evidence_scope_request_key"
  ON "candidate_economics_evidence"("organizationId", "workspaceScopeKey", "provider", "requestId");

CREATE INDEX "candidate_economics_evaluations_researchRunId_candidateId_idx"
  ON "candidate_economics_evaluations"("researchRunId", "candidateId");
CREATE INDEX "candidate_economics_evaluations_candidateId_status_decision_idx"
  ON "candidate_economics_evaluations"("candidateId", "status", "decision", "validUntil");
CREATE INDEX "candidate_economics_evaluations_supplierQuoteEvidenceId_idx"
  ON "candidate_economics_evaluations"("supplierQuoteEvidenceId");
CREATE UNIQUE INDEX "candidate_econ_eval_candidate_policy_input_key"
  ON "candidate_economics_evaluations"("organizationId", "workspaceScopeKey", "candidateId", "policyVersion", "inputSetHash");
CREATE UNIQUE INDEX "candidate_econ_eval_scope_dedupe_key"
  ON "candidate_economics_evaluations"("organizationId", "workspaceScopeKey", "dedupeKey");

CREATE INDEX "candidate_economics_evaluation_inputs_researchRunId_candida_idx"
  ON "candidate_economics_evaluation_inputs"("researchRunId", "candidateId");
CREATE INDEX "candidate_economics_evaluation_inputs_economicsEvidenceId_idx"
  ON "candidate_economics_evaluation_inputs"("economicsEvidenceId");
CREATE UNIQUE INDEX "candidate_economics_evaluation_inputs_evaluationId_role_ord_key"
  ON "candidate_economics_evaluation_inputs"("evaluationId", "role", "ordinal");
CREATE UNIQUE INDEX "candidate_economics_evaluation_inputs_evaluationId_economic_key"
  ON "candidate_economics_evaluation_inputs"("evaluationId", "economicsEvidenceId");

CREATE INDEX "product_launches_researchCandidateId_idx"
  ON "product_launches"("researchCandidateId");
CREATE INDEX "product_launches_economicsEvaluationId_idx"
  ON "product_launches"("economicsEvaluationId");
CREATE INDEX "listing_publish_snapshots_economicsEvaluationId_idx"
  ON "listing_publish_snapshots"("economicsEvaluationId");
CREATE INDEX "external_submissions_economicsEvaluationId_idx"
  ON "external_submissions"("economicsEvaluationId");

ALTER TABLE "candidate_economics_evidence"
  ADD CONSTRAINT "candidate_economics_evidence_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "candidate_economics_evidence"
  ADD CONSTRAINT "candidate_economics_evidence_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "candidate_economics_evidence"
  ADD CONSTRAINT "candidate_economics_evidence_researchRunId_fkey"
  FOREIGN KEY ("researchRunId") REFERENCES "product_research_runs"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "candidate_economics_evidence"
  ADD CONSTRAINT "candidate_economics_evidence_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "product_candidates"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "candidate_economics_evaluations"
  ADD CONSTRAINT "candidate_economics_evaluations_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "candidate_economics_evaluations"
  ADD CONSTRAINT "candidate_economics_evaluations_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "candidate_economics_evaluations"
  ADD CONSTRAINT "candidate_economics_evaluations_researchRunId_fkey"
  FOREIGN KEY ("researchRunId") REFERENCES "product_research_runs"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "candidate_economics_evaluations"
  ADD CONSTRAINT "candidate_economics_evaluations_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "product_candidates"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "candidate_economics_evaluations"
  ADD CONSTRAINT "candidate_economics_evaluations_supplierQuoteEvidenceId_fkey"
  FOREIGN KEY ("supplierQuoteEvidenceId") REFERENCES "supplier_quote_evidence"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "candidate_economics_evaluation_inputs"
  ADD CONSTRAINT "candidate_economics_evaluation_inputs_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "candidate_economics_evaluation_inputs"
  ADD CONSTRAINT "candidate_economics_evaluation_inputs_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "candidate_economics_evaluation_inputs"
  ADD CONSTRAINT "candidate_economics_evaluation_inputs_researchRunId_fkey"
  FOREIGN KEY ("researchRunId") REFERENCES "product_research_runs"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "candidate_economics_evaluation_inputs"
  ADD CONSTRAINT "candidate_economics_evaluation_inputs_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "product_candidates"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "candidate_economics_evaluation_inputs"
  ADD CONSTRAINT "candidate_economics_evaluation_inputs_evaluationId_fkey"
  FOREIGN KEY ("evaluationId") REFERENCES "candidate_economics_evaluations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "candidate_economics_evaluation_inputs"
  ADD CONSTRAINT "candidate_economics_evaluation_inputs_economicsEvidenceId_fkey"
  FOREIGN KEY ("economicsEvidenceId") REFERENCES "candidate_economics_evidence"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_launches"
  ADD CONSTRAINT "product_launches_researchCandidateId_fkey"
  FOREIGN KEY ("researchCandidateId") REFERENCES "product_candidates"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_launches"
  ADD CONSTRAINT "product_launches_economicsEvaluationId_fkey"
  FOREIGN KEY ("economicsEvaluationId") REFERENCES "candidate_economics_evaluations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "listing_publish_snapshots"
  ADD CONSTRAINT "listing_publish_snapshots_economicsEvaluationId_fkey"
  FOREIGN KEY ("economicsEvaluationId") REFERENCES "candidate_economics_evaluations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "external_submissions"
  ADD CONSTRAINT "external_submissions_economicsEvaluationId_fkey"
  FOREIGN KEY ("economicsEvaluationId") REFERENCES "candidate_economics_evaluations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "candidate_economics_evidence"
  ADD CONSTRAINT "candidate_economics_evidence_workspace_scope_check"
  CHECK (
    "workspaceScopeKey" = CASE
      WHEN "workspaceId" IS NULL THEN 'workspace:empty'
      ELSE 'workspace:id:' || "workspaceId"
    END
  );
ALTER TABLE "candidate_economics_evaluations"
  ADD CONSTRAINT "candidate_economics_evaluations_workspace_scope_check"
  CHECK (
    "workspaceScopeKey" = CASE
      WHEN "workspaceId" IS NULL THEN 'workspace:empty'
      ELSE 'workspace:id:' || "workspaceId"
    END
  );
ALTER TABLE "candidate_economics_evaluation_inputs"
  ADD CONSTRAINT "candidate_economics_evaluation_inputs_workspace_scope_check"
  CHECK (
    "workspaceScopeKey" = CASE
      WHEN "workspaceId" IS NULL THEN 'workspace:empty'
      ELSE 'workspace:id:' || "workspaceId"
    END
  );

CREATE FUNCTION "lock_candidate_economics_evidence_parents"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
BEGIN
  PERFORM 1 FROM "organizations"
  WHERE "id" = NEW."organizationId"
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'candidate economics organization binding mismatch'
      USING ERRCODE = '23503';
  END IF;

  IF NEW."workspaceId" IS NOT NULL THEN
    PERFORM 1 FROM "workspaces"
    WHERE "id" = NEW."workspaceId"
      AND "organizationId" = NEW."organizationId"
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'candidate economics workspace binding mismatch'
        USING ERRCODE = '23503';
    END IF;
  END IF;

  PERFORM 1 FROM "product_research_runs"
  WHERE "id" = NEW."researchRunId"
    AND "organizationId" = NEW."organizationId"
    AND "workspaceId" IS NOT DISTINCT FROM NEW."workspaceId"
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'candidate economics research run binding mismatch'
      USING ERRCODE = '23503';
  END IF;

  PERFORM 1 FROM "product_candidates"
  WHERE "id" = NEW."candidateId"
    AND "organizationId" = NEW."organizationId"
    AND "workspaceId" IS NOT DISTINCT FROM NEW."workspaceId"
    AND "researchRunId" = NEW."researchRunId"
    AND "fingerprint" = NEW."binding"->>'candidateFingerprint'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'candidate economics candidate binding mismatch'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "lock_candidate_economics_evidence_parents"() FROM PUBLIC;

CREATE TRIGGER "candidate_economics_evidence_parent_lock"
BEFORE INSERT ON "candidate_economics_evidence"
FOR EACH ROW
EXECUTE FUNCTION "lock_candidate_economics_evidence_parents"();

CREATE FUNCTION "lock_candidate_economics_evaluation_parents"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
BEGIN
  PERFORM 1 FROM "organizations"
  WHERE "id" = NEW."organizationId"
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'candidate economics evaluation organization binding mismatch'
      USING ERRCODE = '23503';
  END IF;

  IF NEW."workspaceId" IS NOT NULL THEN
    PERFORM 1 FROM "workspaces"
    WHERE "id" = NEW."workspaceId"
      AND "organizationId" = NEW."organizationId"
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'candidate economics evaluation workspace binding mismatch'
        USING ERRCODE = '23503';
    END IF;
  END IF;

  PERFORM 1 FROM "product_research_runs"
  WHERE "id" = NEW."researchRunId"
    AND "organizationId" = NEW."organizationId"
    AND "workspaceId" IS NOT DISTINCT FROM NEW."workspaceId"
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'candidate economics evaluation research run binding mismatch'
      USING ERRCODE = '23503';
  END IF;

  PERFORM 1 FROM "product_candidates"
  WHERE "id" = NEW."candidateId"
    AND "organizationId" = NEW."organizationId"
    AND "workspaceId" IS NOT DISTINCT FROM NEW."workspaceId"
    AND "researchRunId" = NEW."researchRunId"
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'candidate economics evaluation candidate binding mismatch'
      USING ERRCODE = '23503';
  END IF;

  IF NEW."supplierQuoteEvidenceId" IS NOT NULL THEN
    PERFORM 1 FROM "supplier_quote_evidence"
    WHERE "id" = NEW."supplierQuoteEvidenceId"
      AND "organizationId" = NEW."organizationId"
      AND "workspaceId" IS NOT DISTINCT FROM NEW."workspaceId"
      AND "researchRunId" = NEW."researchRunId"
      AND "candidateId" = NEW."candidateId"
      AND "verificationStatus" = 'VERIFIED'
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'candidate economics supplier quote binding mismatch'
        USING ERRCODE = '23503';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "lock_candidate_economics_evaluation_parents"() FROM PUBLIC;

CREATE TRIGGER "candidate_economics_evaluations_parent_lock"
BEFORE INSERT ON "candidate_economics_evaluations"
FOR EACH ROW
EXECUTE FUNCTION "lock_candidate_economics_evaluation_parents"();

CREATE FUNCTION "lock_candidate_economics_evaluation_input_parents"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
BEGIN
  PERFORM 1 FROM "organizations"
  WHERE "id" = NEW."organizationId"
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'candidate economics input organization binding mismatch'
      USING ERRCODE = '23503';
  END IF;

  IF NEW."workspaceId" IS NOT NULL THEN
    PERFORM 1 FROM "workspaces"
    WHERE "id" = NEW."workspaceId"
      AND "organizationId" = NEW."organizationId"
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'candidate economics input workspace binding mismatch'
        USING ERRCODE = '23503';
    END IF;
  END IF;

  PERFORM 1 FROM "product_research_runs"
  WHERE "id" = NEW."researchRunId"
    AND "organizationId" = NEW."organizationId"
    AND "workspaceId" IS NOT DISTINCT FROM NEW."workspaceId"
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'candidate economics input research run binding mismatch'
      USING ERRCODE = '23503';
  END IF;

  PERFORM 1 FROM "product_candidates"
  WHERE "id" = NEW."candidateId"
    AND "organizationId" = NEW."organizationId"
    AND "workspaceId" IS NOT DISTINCT FROM NEW."workspaceId"
    AND "researchRunId" = NEW."researchRunId"
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'candidate economics input candidate binding mismatch'
      USING ERRCODE = '23503';
  END IF;

  PERFORM 1 FROM "candidate_economics_evaluations"
  WHERE "id" = NEW."evaluationId"
    AND "organizationId" = NEW."organizationId"
    AND "workspaceId" IS NOT DISTINCT FROM NEW."workspaceId"
    AND "workspaceScopeKey" = NEW."workspaceScopeKey"
    AND "researchRunId" = NEW."researchRunId"
    AND "candidateId" = NEW."candidateId"
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'candidate economics input evaluation binding mismatch'
      USING ERRCODE = '23503';
  END IF;

  PERFORM 1 FROM "candidate_economics_evidence"
  WHERE "id" = NEW."economicsEvidenceId"
    AND "organizationId" = NEW."organizationId"
    AND "workspaceId" IS NOT DISTINCT FROM NEW."workspaceId"
    AND "workspaceScopeKey" = NEW."workspaceScopeKey"
    AND "researchRunId" = NEW."researchRunId"
    AND "candidateId" = NEW."candidateId"
    AND "kind" = NEW."role"
    AND "contentHash" = NEW."evidenceContentHash"
    AND "rawSnapshotSha256" = NEW."rawSnapshotSha256"
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'candidate economics input evidence binding mismatch'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "lock_candidate_economics_evaluation_input_parents"() FROM PUBLIC;

CREATE TRIGGER "candidate_economics_evaluation_inputs_parent_lock"
BEFORE INSERT ON "candidate_economics_evaluation_inputs"
FOR EACH ROW
EXECUTE FUNCTION "lock_candidate_economics_evaluation_input_parents"();

CREATE FUNCTION "reject_candidate_economics_workspace_rebinding"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
BEGIN
  IF OLD."organizationId" IS DISTINCT FROM NEW."organizationId"
     AND (
       EXISTS (SELECT 1 FROM "candidate_economics_evidence" WHERE "workspaceId" = OLD."id")
       OR EXISTS (SELECT 1 FROM "candidate_economics_evaluations" WHERE "workspaceId" = OLD."id")
       OR EXISTS (SELECT 1 FROM "candidate_economics_evaluation_inputs" WHERE "workspaceId" = OLD."id")
     ) THEN
    RAISE EXCEPTION 'workspace is referenced by immutable candidate economics evidence'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "reject_candidate_economics_workspace_rebinding"() FROM PUBLIC;

CREATE TRIGGER "candidate_economics_workspace_binding_guard"
BEFORE UPDATE OF "organizationId" ON "workspaces"
FOR EACH ROW
EXECUTE FUNCTION "reject_candidate_economics_workspace_rebinding"();

CREATE FUNCTION "reject_candidate_economics_research_run_rebinding"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
BEGIN
  IF (
       OLD."organizationId" IS DISTINCT FROM NEW."organizationId"
       OR OLD."workspaceId" IS DISTINCT FROM NEW."workspaceId"
     )
     AND (
       EXISTS (SELECT 1 FROM "candidate_economics_evidence" WHERE "researchRunId" = OLD."id")
       OR EXISTS (SELECT 1 FROM "candidate_economics_evaluations" WHERE "researchRunId" = OLD."id")
       OR EXISTS (SELECT 1 FROM "candidate_economics_evaluation_inputs" WHERE "researchRunId" = OLD."id")
     ) THEN
    RAISE EXCEPTION 'research run is referenced by immutable candidate economics evidence'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "reject_candidate_economics_research_run_rebinding"() FROM PUBLIC;

CREATE TRIGGER "candidate_economics_research_run_binding_guard"
BEFORE UPDATE OF "organizationId", "workspaceId" ON "product_research_runs"
FOR EACH ROW
EXECUTE FUNCTION "reject_candidate_economics_research_run_rebinding"();

CREATE FUNCTION "reject_candidate_economics_candidate_rebinding"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  binding_referenced BOOLEAN;
BEGIN
  SELECT
    EXISTS (SELECT 1 FROM "candidate_economics_evidence" WHERE "candidateId" = OLD."id")
    OR EXISTS (SELECT 1 FROM "candidate_economics_evaluations" WHERE "candidateId" = OLD."id")
    OR EXISTS (SELECT 1 FROM "candidate_economics_evaluation_inputs" WHERE "candidateId" = OLD."id")
    OR EXISTS (SELECT 1 FROM "product_launches" WHERE "researchCandidateId" = OLD."id")
  INTO binding_referenced;

  IF TG_OP = 'DELETE' THEN
    IF binding_referenced THEN
      RAISE EXCEPTION 'candidate is referenced by immutable candidate economics evidence'
        USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF (
       OLD."id" IS DISTINCT FROM NEW."id"
       OR OLD."organizationId" IS DISTINCT FROM NEW."organizationId"
       OR OLD."workspaceId" IS DISTINCT FROM NEW."workspaceId"
       OR OLD."researchRunId" IS DISTINCT FROM NEW."researchRunId"
       OR OLD."fingerprint" IS DISTINCT FROM NEW."fingerprint"
     )
     AND binding_referenced THEN
    RAISE EXCEPTION 'candidate binding is referenced by immutable candidate economics evidence'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "reject_candidate_economics_candidate_rebinding"() FROM PUBLIC;

CREATE TRIGGER "candidate_economics_candidate_binding_guard"
BEFORE UPDATE OF "id", "organizationId", "workspaceId", "researchRunId", "fingerprint"
ON "product_candidates"
FOR EACH ROW
EXECUTE FUNCTION "reject_candidate_economics_candidate_rebinding"();

CREATE TRIGGER "candidate_economics_candidate_delete_guard"
BEFORE DELETE ON "product_candidates"
FOR EACH ROW
EXECUTE FUNCTION "reject_candidate_economics_candidate_rebinding"();

CREATE FUNCTION "validate_product_launch_economics_chain"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
BEGIN
  IF (NEW."economicsEvaluationId" IS NULL) <> (NEW."economicsEvaluationHash" IS NULL) THEN
    RAISE EXCEPTION 'product launch economics id and hash must be supplied together'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."economicsEvaluationId" IS NOT NULL
     AND NEW."researchCandidateId" IS NULL THEN
    RAISE EXCEPTION 'product launch economics proof requires a research candidate'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."researchCandidateId" IS NOT NULL THEN
    PERFORM 1 FROM "product_candidates"
    WHERE "id" = NEW."researchCandidateId"
      AND "organizationId" = NEW."organizationId"
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'product launch research candidate tenant mismatch'
        USING ERRCODE = '23503';
    END IF;
  END IF;

  IF NEW."economicsEvaluationId" IS NOT NULL THEN
    PERFORM 1 FROM "candidate_economics_evaluations"
    WHERE "id" = NEW."economicsEvaluationId"
      AND "organizationId" = NEW."organizationId"
      AND "candidateId" = NEW."researchCandidateId"
      AND "contentHash" = NEW."economicsEvaluationHash"
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'product launch economics proof binding mismatch'
        USING ERRCODE = '23503';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD."researchCandidateId" IS NOT NULL
       AND NEW."researchCandidateId" IS DISTINCT FROM OLD."researchCandidateId" THEN
      RAISE EXCEPTION 'product launch research candidate is write-once'
        USING ERRCODE = '55000';
    END IF;
    IF OLD."economicsEvaluationId" IS NOT NULL
       AND NEW."economicsEvaluationId" IS DISTINCT FROM OLD."economicsEvaluationId" THEN
      RAISE EXCEPTION 'product launch economics evaluation is write-once'
        USING ERRCODE = '55000';
    END IF;
    IF OLD."economicsEvaluationHash" IS NOT NULL
       AND NEW."economicsEvaluationHash" IS DISTINCT FROM OLD."economicsEvaluationHash" THEN
      RAISE EXCEPTION 'product launch economics hash is write-once'
        USING ERRCODE = '55000';
    END IF;
    IF (
         NEW."researchCandidateId" IS DISTINCT FROM OLD."researchCandidateId"
         OR NEW."economicsEvaluationId" IS DISTINCT FROM OLD."economicsEvaluationId"
         OR NEW."economicsEvaluationHash" IS DISTINCT FROM OLD."economicsEvaluationHash"
       )
       AND EXISTS (
         SELECT 1 FROM "listing_publish_snapshots"
         WHERE "productLaunchId" = OLD."id"
       ) THEN
      RAISE EXCEPTION 'product launch economics binding cannot change after snapshot creation'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "validate_product_launch_economics_chain"() FROM PUBLIC;

CREATE TRIGGER "product_launches_economics_chain_guard"
BEFORE INSERT OR UPDATE ON "product_launches"
FOR EACH ROW
EXECUTE FUNCTION "validate_product_launch_economics_chain"();

CREATE FUNCTION "validate_listing_publish_snapshot_economics_chain"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  evaluation_candidate_id TEXT;
  proof_count INTEGER;
BEGIN
  proof_count :=
    (NEW."economicsEvaluationId" IS NOT NULL)::INTEGER
    + (NEW."economicsEvaluationHash" IS NOT NULL)::INTEGER
    + (NEW."economicsInputSetHash" IS NOT NULL)::INTEGER
    + (NEW."economicsValidUntil" IS NOT NULL)::INTEGER;

  IF proof_count NOT IN (0, 4) THEN
    RAISE EXCEPTION 'listing publish snapshot economics proof is incomplete'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' AND proof_count = 0 THEN
    RAISE EXCEPTION 'listing publish snapshot requires verified economics proof'
      USING ERRCODE = '23514';
  END IF;

  IF proof_count = 4 THEN
    SELECT "candidateId"
    INTO evaluation_candidate_id
    FROM "candidate_economics_evaluations"
    WHERE "id" = NEW."economicsEvaluationId"
      AND "organizationId" = NEW."organizationId"
      AND "contentHash" = NEW."economicsEvaluationHash"
      AND "inputSetHash" = NEW."economicsInputSetHash"
      AND "validUntil" = NEW."economicsValidUntil"
      AND "status" = 'VERIFIED'
      AND "decision" = 'PASS'
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'listing publish snapshot economics evaluation mismatch'
        USING ERRCODE = '23503';
    END IF;

    IF TG_OP = 'INSERT' AND NEW."economicsValidUntil" <= CURRENT_TIMESTAMP THEN
      RAISE EXCEPTION 'listing publish snapshot economics proof is stale'
        USING ERRCODE = '23514';
    END IF;

    PERFORM 1 FROM "product_launches"
    WHERE "id" = NEW."productLaunchId"
      AND "organizationId" = NEW."organizationId"
      AND "researchCandidateId" = evaluation_candidate_id
      AND "economicsEvaluationId" = NEW."economicsEvaluationId"
      AND "economicsEvaluationHash" = NEW."economicsEvaluationHash"
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'listing publish snapshot product launch proof mismatch'
        USING ERRCODE = '23503';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "validate_listing_publish_snapshot_economics_chain"() FROM PUBLIC;

CREATE TRIGGER "listing_publish_snapshots_economics_chain_guard"
BEFORE INSERT OR UPDATE ON "listing_publish_snapshots"
FOR EACH ROW
EXECUTE FUNCTION "validate_listing_publish_snapshot_economics_chain"();

CREATE FUNCTION "validate_external_submission_economics_chain"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  evaluation_candidate_id TEXT;
  snapshot_valid_until TIMESTAMP(3);
  proof_count INTEGER;
BEGIN
  proof_count :=
    (NEW."economicsEvaluationId" IS NOT NULL)::INTEGER
    + (NEW."economicsEvaluationHash" IS NOT NULL)::INTEGER;

  IF proof_count NOT IN (0, 2) THEN
    RAISE EXCEPTION 'external submission economics proof is incomplete'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' AND proof_count = 0 THEN
    RAISE EXCEPTION 'external submission requires verified economics proof'
      USING ERRCODE = '23514';
  END IF;

  IF proof_count = 2 THEN
    SELECT "candidateId"
    INTO evaluation_candidate_id
    FROM "candidate_economics_evaluations"
    WHERE "id" = NEW."economicsEvaluationId"
      AND "organizationId" = NEW."organizationId"
      AND "contentHash" = NEW."economicsEvaluationHash"
      AND "status" = 'VERIFIED'
      AND "decision" = 'PASS'
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'external submission economics evaluation mismatch'
        USING ERRCODE = '23503';
    END IF;

    SELECT "economicsValidUntil"
    INTO snapshot_valid_until
    FROM "listing_publish_snapshots"
    WHERE "id" = NEW."publishSnapshotId"
      AND "organizationId" = NEW."organizationId"
      AND "productLaunchId" = NEW."productLaunchId"
      AND "economicsEvaluationId" = NEW."economicsEvaluationId"
      AND "economicsEvaluationHash" = NEW."economicsEvaluationHash"
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'external submission publish snapshot proof mismatch'
        USING ERRCODE = '23503';
    END IF;

    IF TG_OP = 'INSERT' AND snapshot_valid_until <= CURRENT_TIMESTAMP THEN
      RAISE EXCEPTION 'external submission economics proof is stale'
        USING ERRCODE = '23514';
    END IF;

    PERFORM 1 FROM "product_launches"
    WHERE "id" = NEW."productLaunchId"
      AND "organizationId" = NEW."organizationId"
      AND "researchCandidateId" = evaluation_candidate_id
      AND "economicsEvaluationId" = NEW."economicsEvaluationId"
      AND "economicsEvaluationHash" = NEW."economicsEvaluationHash"
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'external submission product launch proof mismatch'
        USING ERRCODE = '23503';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "validate_external_submission_economics_chain"() FROM PUBLIC;

CREATE TRIGGER "external_submissions_economics_chain_guard"
BEFORE INSERT OR UPDATE ON "external_submissions"
FOR EACH ROW
EXECUTE FUNCTION "validate_external_submission_economics_chain"();

CREATE FUNCTION "reject_economics_publish_audit_delete"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'economics-backed publish audit rows are immutable'
    USING ERRCODE = '55000';
END;
$$;

REVOKE ALL ON FUNCTION "reject_economics_publish_audit_delete"() FROM PUBLIC;

CREATE TRIGGER "listing_publish_snapshots_delete_guard"
BEFORE DELETE ON "listing_publish_snapshots"
FOR EACH ROW
EXECUTE FUNCTION "reject_economics_publish_audit_delete"();

CREATE TRIGGER "external_submissions_delete_guard"
BEFORE DELETE ON "external_submissions"
FOR EACH ROW
EXECUTE FUNCTION "reject_economics_publish_audit_delete"();

ALTER TABLE "candidate_economics_evidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "candidate_economics_evidence" FORCE ROW LEVEL SECURITY;

CREATE POLICY "candidate_economics_evidence_select"
ON "candidate_economics_evidence"
FOR SELECT
USING (
  "organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')
  AND EXISTS (
    SELECT 1
    FROM "product_research_runs" AS research_run
    WHERE research_run."id" = "candidate_economics_evidence"."researchRunId"
      AND research_run."organizationId" = "candidate_economics_evidence"."organizationId"
      AND research_run."workspaceId" IS NOT DISTINCT FROM "candidate_economics_evidence"."workspaceId"
  )
  AND EXISTS (
    SELECT 1
    FROM "product_candidates" AS candidate
    WHERE candidate."id" = "candidate_economics_evidence"."candidateId"
      AND candidate."organizationId" = "candidate_economics_evidence"."organizationId"
      AND candidate."researchRunId" = "candidate_economics_evidence"."researchRunId"
      AND candidate."workspaceId" IS NOT DISTINCT FROM "candidate_economics_evidence"."workspaceId"
  )
  AND (
    "workspaceId" IS NULL
    OR EXISTS (
      SELECT 1
      FROM "workspaces" AS workspace
      WHERE workspace."id" = "candidate_economics_evidence"."workspaceId"
        AND workspace."organizationId" = "candidate_economics_evidence"."organizationId"
    )
  )
);

CREATE POLICY "candidate_economics_evidence_insert"
ON "candidate_economics_evidence"
FOR INSERT
WITH CHECK (
  "organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')
  AND EXISTS (
    SELECT 1
    FROM "product_research_runs" AS research_run
    WHERE research_run."id" = "candidate_economics_evidence"."researchRunId"
      AND research_run."organizationId" = "candidate_economics_evidence"."organizationId"
      AND research_run."workspaceId" IS NOT DISTINCT FROM "candidate_economics_evidence"."workspaceId"
  )
  AND EXISTS (
    SELECT 1
    FROM "product_candidates" AS candidate
    WHERE candidate."id" = "candidate_economics_evidence"."candidateId"
      AND candidate."organizationId" = "candidate_economics_evidence"."organizationId"
      AND candidate."researchRunId" = "candidate_economics_evidence"."researchRunId"
      AND candidate."workspaceId" IS NOT DISTINCT FROM "candidate_economics_evidence"."workspaceId"
  )
  AND (
    "workspaceId" IS NULL
    OR EXISTS (
      SELECT 1
      FROM "workspaces" AS workspace
      WHERE workspace."id" = "candidate_economics_evidence"."workspaceId"
        AND workspace."organizationId" = "candidate_economics_evidence"."organizationId"
    )
  )
);

ALTER TABLE "candidate_economics_evaluations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "candidate_economics_evaluations" FORCE ROW LEVEL SECURITY;

CREATE POLICY "candidate_economics_evaluations_select"
ON "candidate_economics_evaluations"
FOR SELECT
USING (
  "organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')
  AND EXISTS (
    SELECT 1
    FROM "product_research_runs" AS research_run
    WHERE research_run."id" = "candidate_economics_evaluations"."researchRunId"
      AND research_run."organizationId" = "candidate_economics_evaluations"."organizationId"
      AND research_run."workspaceId" IS NOT DISTINCT FROM "candidate_economics_evaluations"."workspaceId"
  )
  AND EXISTS (
    SELECT 1
    FROM "product_candidates" AS candidate
    WHERE candidate."id" = "candidate_economics_evaluations"."candidateId"
      AND candidate."organizationId" = "candidate_economics_evaluations"."organizationId"
      AND candidate."researchRunId" = "candidate_economics_evaluations"."researchRunId"
      AND candidate."workspaceId" IS NOT DISTINCT FROM "candidate_economics_evaluations"."workspaceId"
  )
  AND (
    "supplierQuoteEvidenceId" IS NULL
    OR EXISTS (
      SELECT 1
      FROM "supplier_quote_evidence" AS supplier_quote
      WHERE supplier_quote."id" = "candidate_economics_evaluations"."supplierQuoteEvidenceId"
        AND supplier_quote."organizationId" = "candidate_economics_evaluations"."organizationId"
        AND supplier_quote."researchRunId" = "candidate_economics_evaluations"."researchRunId"
        AND supplier_quote."candidateId" = "candidate_economics_evaluations"."candidateId"
        AND supplier_quote."workspaceId" IS NOT DISTINCT FROM "candidate_economics_evaluations"."workspaceId"
    )
  )
  AND (
    "workspaceId" IS NULL
    OR EXISTS (
      SELECT 1
      FROM "workspaces" AS workspace
      WHERE workspace."id" = "candidate_economics_evaluations"."workspaceId"
        AND workspace."organizationId" = "candidate_economics_evaluations"."organizationId"
    )
  )
);

CREATE POLICY "candidate_economics_evaluations_insert"
ON "candidate_economics_evaluations"
FOR INSERT
WITH CHECK (
  "organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')
  AND EXISTS (
    SELECT 1
    FROM "product_research_runs" AS research_run
    WHERE research_run."id" = "candidate_economics_evaluations"."researchRunId"
      AND research_run."organizationId" = "candidate_economics_evaluations"."organizationId"
      AND research_run."workspaceId" IS NOT DISTINCT FROM "candidate_economics_evaluations"."workspaceId"
  )
  AND EXISTS (
    SELECT 1
    FROM "product_candidates" AS candidate
    WHERE candidate."id" = "candidate_economics_evaluations"."candidateId"
      AND candidate."organizationId" = "candidate_economics_evaluations"."organizationId"
      AND candidate."researchRunId" = "candidate_economics_evaluations"."researchRunId"
      AND candidate."workspaceId" IS NOT DISTINCT FROM "candidate_economics_evaluations"."workspaceId"
  )
  AND (
    "supplierQuoteEvidenceId" IS NULL
    OR EXISTS (
      SELECT 1
      FROM "supplier_quote_evidence" AS supplier_quote
      WHERE supplier_quote."id" = "candidate_economics_evaluations"."supplierQuoteEvidenceId"
        AND supplier_quote."organizationId" = "candidate_economics_evaluations"."organizationId"
        AND supplier_quote."researchRunId" = "candidate_economics_evaluations"."researchRunId"
        AND supplier_quote."candidateId" = "candidate_economics_evaluations"."candidateId"
        AND supplier_quote."workspaceId" IS NOT DISTINCT FROM "candidate_economics_evaluations"."workspaceId"
    )
  )
  AND (
    "workspaceId" IS NULL
    OR EXISTS (
      SELECT 1
      FROM "workspaces" AS workspace
      WHERE workspace."id" = "candidate_economics_evaluations"."workspaceId"
        AND workspace."organizationId" = "candidate_economics_evaluations"."organizationId"
    )
  )
);

ALTER TABLE "candidate_economics_evaluation_inputs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "candidate_economics_evaluation_inputs" FORCE ROW LEVEL SECURITY;

CREATE POLICY "candidate_economics_evaluation_inputs_select"
ON "candidate_economics_evaluation_inputs"
FOR SELECT
USING (
  "organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')
  AND EXISTS (
    SELECT 1
    FROM "candidate_economics_evaluations" AS evaluation
    WHERE evaluation."id" = "candidate_economics_evaluation_inputs"."evaluationId"
      AND evaluation."organizationId" = "candidate_economics_evaluation_inputs"."organizationId"
      AND evaluation."researchRunId" = "candidate_economics_evaluation_inputs"."researchRunId"
      AND evaluation."candidateId" = "candidate_economics_evaluation_inputs"."candidateId"
      AND evaluation."workspaceId" IS NOT DISTINCT FROM "candidate_economics_evaluation_inputs"."workspaceId"
      AND evaluation."workspaceScopeKey" = "candidate_economics_evaluation_inputs"."workspaceScopeKey"
  )
  AND EXISTS (
    SELECT 1
    FROM "candidate_economics_evidence" AS evidence
    WHERE evidence."id" = "candidate_economics_evaluation_inputs"."economicsEvidenceId"
      AND evidence."organizationId" = "candidate_economics_evaluation_inputs"."organizationId"
      AND evidence."researchRunId" = "candidate_economics_evaluation_inputs"."researchRunId"
      AND evidence."candidateId" = "candidate_economics_evaluation_inputs"."candidateId"
      AND evidence."workspaceId" IS NOT DISTINCT FROM "candidate_economics_evaluation_inputs"."workspaceId"
      AND evidence."workspaceScopeKey" = "candidate_economics_evaluation_inputs"."workspaceScopeKey"
      AND evidence."contentHash" = "candidate_economics_evaluation_inputs"."evidenceContentHash"
      AND evidence."rawSnapshotSha256" = "candidate_economics_evaluation_inputs"."rawSnapshotSha256"
  )
);

CREATE POLICY "candidate_economics_evaluation_inputs_insert"
ON "candidate_economics_evaluation_inputs"
FOR INSERT
WITH CHECK (
  "organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')
  AND EXISTS (
    SELECT 1
    FROM "candidate_economics_evaluations" AS evaluation
    WHERE evaluation."id" = "candidate_economics_evaluation_inputs"."evaluationId"
      AND evaluation."organizationId" = "candidate_economics_evaluation_inputs"."organizationId"
      AND evaluation."researchRunId" = "candidate_economics_evaluation_inputs"."researchRunId"
      AND evaluation."candidateId" = "candidate_economics_evaluation_inputs"."candidateId"
      AND evaluation."workspaceId" IS NOT DISTINCT FROM "candidate_economics_evaluation_inputs"."workspaceId"
      AND evaluation."workspaceScopeKey" = "candidate_economics_evaluation_inputs"."workspaceScopeKey"
  )
  AND EXISTS (
    SELECT 1
    FROM "candidate_economics_evidence" AS evidence
    WHERE evidence."id" = "candidate_economics_evaluation_inputs"."economicsEvidenceId"
      AND evidence."organizationId" = "candidate_economics_evaluation_inputs"."organizationId"
      AND evidence."researchRunId" = "candidate_economics_evaluation_inputs"."researchRunId"
      AND evidence."candidateId" = "candidate_economics_evaluation_inputs"."candidateId"
      AND evidence."workspaceId" IS NOT DISTINCT FROM "candidate_economics_evaluation_inputs"."workspaceId"
      AND evidence."workspaceScopeKey" = "candidate_economics_evaluation_inputs"."workspaceScopeKey"
      AND evidence."contentHash" = "candidate_economics_evaluation_inputs"."evidenceContentHash"
      AND evidence."rawSnapshotSha256" = "candidate_economics_evaluation_inputs"."rawSnapshotSha256"
  )
);

DROP POLICY "listing_publish_snapshots_organization_isolation"
ON "listing_publish_snapshots";

CREATE POLICY "listing_publish_snapshots_select"
ON "listing_publish_snapshots"
FOR SELECT
USING (
  "organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')
);

CREATE POLICY "listing_publish_snapshots_insert"
ON "listing_publish_snapshots"
FOR INSERT
WITH CHECK (
  "organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')
);

CREATE POLICY "listing_publish_snapshots_update"
ON "listing_publish_snapshots"
FOR UPDATE
USING (
  "organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')
)
WITH CHECK (
  "organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')
);

DROP POLICY "external_submissions_organization_isolation"
ON "external_submissions";

CREATE POLICY "external_submissions_select"
ON "external_submissions"
FOR SELECT
USING (
  "organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')
);

CREATE POLICY "external_submissions_insert"
ON "external_submissions"
FOR INSERT
WITH CHECK (
  "organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')
);

CREATE POLICY "external_submissions_update"
ON "external_submissions"
FOR UPDATE
USING (
  "organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')
)
WITH CHECK (
  "organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')
);

CREATE FUNCTION "reject_candidate_economics_ledger_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'candidate economics evidence is immutable'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "candidate_economics_evidence_immutable_guard"
BEFORE UPDATE OR DELETE ON "candidate_economics_evidence"
FOR EACH ROW
EXECUTE FUNCTION "reject_candidate_economics_ledger_mutation"();

CREATE TRIGGER "candidate_economics_evaluations_immutable_guard"
BEFORE UPDATE OR DELETE ON "candidate_economics_evaluations"
FOR EACH ROW
EXECUTE FUNCTION "reject_candidate_economics_ledger_mutation"();

CREATE TRIGGER "candidate_economics_evaluation_inputs_immutable_guard"
BEFORE UPDATE OR DELETE ON "candidate_economics_evaluation_inputs"
FOR EACH ROW
EXECUTE FUNCTION "reject_candidate_economics_ledger_mutation"();

-- Economics proof is part of the immutable publish snapshot payload.
CREATE OR REPLACE FUNCTION prevent_listing_publish_snapshot_payload_mutation()
RETURNS trigger AS $$
BEGIN
  IF NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
    OR NEW."productLaunchId" IS DISTINCT FROM OLD."productLaunchId"
    OR NEW."listingDraftId" IS DISTINCT FROM OLD."listingDraftId"
    OR NEW."reviewTaskId" IS DISTINCT FROM OLD."reviewTaskId"
    OR NEW."productId" IS DISTINCT FROM OLD."productId"
    OR NEW."channelId" IS DISTINCT FROM OLD."channelId"
    OR NEW."target" IS DISTINCT FROM OLD."target"
    OR NEW."schemaVersion" IS DISTINCT FROM OLD."schemaVersion"
    OR NEW."listingApprovalHash" IS DISTINCT FROM OLD."listingApprovalHash"
    OR NEW."economicsEvaluationId" IS DISTINCT FROM OLD."economicsEvaluationId"
    OR NEW."economicsEvaluationHash" IS DISTINCT FROM OLD."economicsEvaluationHash"
    OR NEW."economicsInputSetHash" IS DISTINCT FROM OLD."economicsInputSetHash"
    OR NEW."economicsValidUntil" IS DISTINCT FROM OLD."economicsValidUntil"
    OR NEW."snapshot" IS DISTINCT FROM OLD."snapshot"
    OR NEW."snapshotHash" IS DISTINCT FROM OLD."snapshotHash"
    OR NEW."approvedBy" IS DISTINCT FROM OLD."approvedBy"
    OR NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'Listing publish snapshot payload is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The evaluation proof travels with the idempotent outbound identity.
CREATE OR REPLACE FUNCTION prevent_external_submission_identity_mutation()
RETURNS trigger AS $$
BEGIN
  IF NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
    OR NEW."productLaunchId" IS DISTINCT FROM OLD."productLaunchId"
    OR NEW."publishSnapshotId" IS DISTINCT FROM OLD."publishSnapshotId"
    OR NEW."provider" IS DISTINCT FROM OLD."provider"
    OR NEW."operation" IS DISTINCT FROM OLD."operation"
    OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
    OR NEW."requestHash" IS DISTINCT FROM OLD."requestHash"
    OR (
      OLD."payloadHash" IS NOT NULL
      AND NEW."payloadHash" IS DISTINCT FROM OLD."payloadHash"
    )
    OR NEW."economicsEvaluationId" IS DISTINCT FROM OLD."economicsEvaluationId"
    OR NEW."economicsEvaluationHash" IS DISTINCT FROM OLD."economicsEvaluationHash"
    OR NEW."request" IS DISTINCT FROM OLD."request"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'External submission identity is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $candidate_economics_app_role_grant$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'shopmate_app') THEN
    EXECUTE 'GRANT SELECT, INSERT ON "candidate_economics_evidence" TO "shopmate_app"';
    EXECUTE 'REVOKE UPDATE, DELETE ON "candidate_economics_evidence" FROM "shopmate_app"';
    EXECUTE 'GRANT SELECT, INSERT ON "candidate_economics_evaluations" TO "shopmate_app"';
    EXECUTE 'REVOKE UPDATE, DELETE ON "candidate_economics_evaluations" FROM "shopmate_app"';
    EXECUTE 'GRANT SELECT, INSERT ON "candidate_economics_evaluation_inputs" TO "shopmate_app"';
    EXECUTE 'REVOKE UPDATE, DELETE ON "candidate_economics_evaluation_inputs" FROM "shopmate_app"';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON "listing_publish_snapshots" TO "shopmate_app"';
    EXECUTE 'REVOKE DELETE ON "listing_publish_snapshots" FROM "shopmate_app"';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON "external_submissions" TO "shopmate_app"';
    EXECUTE 'REVOKE DELETE ON "external_submissions" FROM "shopmate_app"';
  END IF;
END
$candidate_economics_app_role_grant$;

COMMIT;

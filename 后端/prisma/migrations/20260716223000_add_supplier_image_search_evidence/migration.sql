CREATE FUNCTION "supplier_image_search_offers_are_display_only"(payload JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT
    jsonb_typeof(payload) = 'array'
    AND jsonb_array_length(payload) BETWEEN 0 AND 50
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(payload) AS item(offer)
      WHERE jsonb_typeof(offer) <> 'object'
        OR NOT (offer ?& ARRAY[
          'offerId',
          'subject',
          'detailUrl',
          'imageUrl',
          'distributionFreePostage',
          'displayPriceEvidence'
        ])
        OR EXISTS (
          SELECT 1
          FROM jsonb_object_keys(offer) AS key(name)
          WHERE name <> ALL (ARRAY[
            'offerId',
            'subject',
            'detailUrl',
            'imageUrl',
            'distributionFreePostage',
            'displayPriceEvidence'
          ])
        )
        OR jsonb_typeof(offer->'offerId') <> 'string'
        OR (offer->>'offerId') !~ '^[0-9]{1,32}$'
        OR jsonb_typeof(offer->'subject') NOT IN ('string', 'null')
        OR (
          jsonb_typeof(offer->'subject') = 'string'
          AND char_length(offer->>'subject') NOT BETWEEN 1 AND 1000
        )
        OR jsonb_typeof(offer->'detailUrl') NOT IN ('string', 'null')
        OR (
          jsonb_typeof(offer->'detailUrl') = 'string'
          AND (
            char_length(offer->>'detailUrl') > 4096
            OR (offer->>'detailUrl') !~* '^https://[^/?#@[:space:]]+([/?#]|$)'
            OR (offer->>'detailUrl') ~* '^https://[^/?#]*@'
            OR split_part(offer->>'detailUrl', '#', 1) ~* '[?&](access([_-]|%5f|%2d)?token|api([_-]|%5f|%2d)?key|authorization|credential|password|secret|signature)(=|&|$)'
            OR split_part(offer->>'detailUrl', '#', 1) ~* '[?&][^=&#]*%[0-9a-f]{2}[^=&#]*(=|&|$)'
          )
        )
        OR jsonb_typeof(offer->'imageUrl') NOT IN ('string', 'null')
        OR (
          jsonb_typeof(offer->'imageUrl') = 'string'
          AND (
            char_length(offer->>'imageUrl') > 4096
            OR (offer->>'imageUrl') !~* '^https://[^/?#@[:space:]]+([/?#]|$)'
            OR (offer->>'imageUrl') ~* '^https://[^/?#]*@'
            OR split_part(offer->>'imageUrl', '#', 1) ~* '[?&](access([_-]|%5f|%2d)?token|api([_-]|%5f|%2d)?key|authorization|credential|password|secret|signature)(=|&|$)'
            OR split_part(offer->>'imageUrl', '#', 1) ~* '[?&][^=&#]*%[0-9a-f]{2}[^=&#]*(=|&|$)'
          )
        )
        OR jsonb_typeof(offer->'distributionFreePostage') NOT IN ('boolean', 'null')
        OR jsonb_typeof(offer->'displayPriceEvidence') <> 'object'
        OR NOT ((offer->'displayPriceEvidence') ?& ARRAY[
          'price',
          'consignPrice',
          'multipleConsignPrice',
          'evidenceUse',
          'verifiedProcurementCost'
        ])
        OR EXISTS (
          SELECT 1
          FROM jsonb_object_keys(offer->'displayPriceEvidence') AS key(name)
          WHERE name <> ALL (ARRAY[
            'price',
            'consignPrice',
            'multipleConsignPrice',
            'evidenceUse',
            'verifiedProcurementCost'
          ])
        )
        OR jsonb_typeof(offer->'displayPriceEvidence'->'price') NOT IN ('string', 'null')
        OR jsonb_typeof(offer->'displayPriceEvidence'->'consignPrice') NOT IN ('string', 'null')
        OR jsonb_typeof(offer->'displayPriceEvidence'->'multipleConsignPrice') NOT IN ('string', 'null')
        OR (
          jsonb_typeof(offer->'displayPriceEvidence'->'price') = 'string'
          AND (
            btrim(offer->'displayPriceEvidence'->>'price') = ''
            OR length(btrim(offer->'displayPriceEvidence'->>'price')) > 128
          )
        )
        OR (
          jsonb_typeof(offer->'displayPriceEvidence'->'consignPrice') = 'string'
          AND (
            btrim(offer->'displayPriceEvidence'->>'consignPrice') = ''
            OR length(btrim(offer->'displayPriceEvidence'->>'consignPrice')) > 128
          )
        )
        OR (
          jsonb_typeof(offer->'displayPriceEvidence'->'multipleConsignPrice') = 'string'
          AND (
            btrim(offer->'displayPriceEvidence'->>'multipleConsignPrice') = ''
            OR length(btrim(offer->'displayPriceEvidence'->>'multipleConsignPrice')) > 128
          )
        )
        OR jsonb_typeof(offer->'displayPriceEvidence'->'evidenceUse') IS DISTINCT FROM 'string'
        OR offer->'displayPriceEvidence'->>'evidenceUse' IS DISTINCT FROM 'DISPLAY_ONLY'
        OR offer->'displayPriceEvidence'->'verifiedProcurementCost' IS DISTINCT FROM 'false'::jsonb
    );
$$;

CREATE TABLE "supplier_image_search_evidence" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "workspaceScopeKey" TEXT NOT NULL,
    "researchRunId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "adapterVersion" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "rawSnapshotSha256" TEXT NOT NULL,
    "canonicalizationVersion" TEXT NOT NULL,
    "sourceOriginalSha256" TEXT NOT NULL,
    "sourceCanonicalSha256" TEXT NOT NULL,
    "canonicalByteSize" INTEGER NOT NULL,
    "canonicalMimeType" TEXT NOT NULL,
    "canonicalWidth" INTEGER NOT NULL,
    "canonicalHeight" INTEGER NOT NULL,
    "retrievalHashAlgorithm" TEXT NOT NULL,
    "retrievalHash" TEXT NOT NULL,
    "providerResultCount" INTEGER NOT NULL,
    "normalizedOffers" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "contentCanonicalizerVersion" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_image_search_evidence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "supplier_image_search_evidence_contract_check" CHECK (
      "schemaVersion" = 'supplier-image-search/v1' AND
      char_length("provider") BETWEEN 1 AND 100 AND
      char_length("adapterVersion") BETWEEN 3 AND 100 AND
      char_length("requestId") BETWEEN 3 AND 160 AND
      char_length("canonicalizationVersion") BETWEEN 3 AND 100 AND
      "contentCanonicalizerVersion" = 'supplier-image-search-jcs/v1' AND
      "outcome" IN ('MATCHES', 'NO_RESULTS') AND
      "canonicalMimeType" = 'image/png' AND
      "retrievalHashAlgorithm" = 'DHASH64'
    ),
    CONSTRAINT "supplier_image_search_evidence_image_facts_check" CHECK (
      "canonicalByteSize" BETWEEN 1 AND 3145728 AND
      "canonicalWidth" BETWEEN 1 AND 16384 AND
      "canonicalHeight" BETWEEN 1 AND 16384 AND
      "providerResultCount" BETWEEN 0 AND 500
    ),
    CONSTRAINT "supplier_image_search_evidence_hashes_check" CHECK (
      "rawSnapshotSha256" ~ '^[a-f0-9]{64}$' AND
      "sourceOriginalSha256" ~ '^[a-f0-9]{64}$' AND
      "sourceCanonicalSha256" ~ '^[a-f0-9]{64}$' AND
      "retrievalHash" ~ '^[a-f0-9]{16}$' AND
      "contentHash" ~ '^[a-f0-9]{64}$' AND
      "dedupeKey" ~ '^[a-f0-9]{64}$'
    ),
    CONSTRAINT "supplier_image_search_evidence_workspace_scope_check" CHECK (
      "workspaceScopeKey" = CASE
        WHEN "workspaceId" IS NULL THEN 'workspace:empty'
        ELSE 'workspace:id:' || "workspaceId"
      END
    ),
    CONSTRAINT "supplier_image_search_evidence_offers_check" CHECK (
      "supplier_image_search_offers_are_display_only"("normalizedOffers") AND
      jsonb_array_length("normalizedOffers") <= 50 AND
      (
        (
          "outcome" = 'MATCHES' AND
          "providerResultCount" >= 1 AND
          jsonb_array_length("normalizedOffers") >= 1 AND
          "providerResultCount" >= jsonb_array_length("normalizedOffers")
        )
        OR
        (
          "outcome" = 'NO_RESULTS' AND
          "providerResultCount" = 0 AND
          jsonb_array_length("normalizedOffers") = 0
        )
      )
    )
);

CREATE UNIQUE INDEX "supplier_image_search_evidence_organizationId_dedupeKey_key"
ON "supplier_image_search_evidence"("organizationId", "dedupeKey");
CREATE UNIQUE INDEX "supplier_image_search_evidence_organizationId_workspaceScopeKey_requestId_key"
ON "supplier_image_search_evidence"("organizationId", "workspaceScopeKey", "requestId");
CREATE INDEX "supplier_image_search_evidence_researchRunId_candidateId_idx"
ON "supplier_image_search_evidence"("researchRunId", "candidateId");
CREATE INDEX "supplier_image_search_evidence_candidateId_createdAt_idx"
ON "supplier_image_search_evidence"("candidateId", "createdAt");
CREATE INDEX "supplier_image_search_evidence_organizationId_provider_fetchedAt_idx"
ON "supplier_image_search_evidence"("organizationId", "provider", "fetchedAt");

ALTER TABLE "supplier_image_search_evidence"
ADD CONSTRAINT "supplier_image_search_evidence_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_image_search_evidence"
ADD CONSTRAINT "supplier_image_search_evidence_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_image_search_evidence"
ADD CONSTRAINT "supplier_image_search_evidence_researchRunId_fkey"
FOREIGN KEY ("researchRunId") REFERENCES "product_research_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_image_search_evidence"
ADD CONSTRAINT "supplier_image_search_evidence_candidateId_fkey"
FOREIGN KEY ("candidateId") REFERENCES "product_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "reject_supplier_image_search_evidence_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'supplier_image_search_evidence is append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "supplier_image_search_evidence_immutable_guard"
BEFORE UPDATE OR DELETE ON "supplier_image_search_evidence"
FOR EACH ROW
EXECUTE FUNCTION "reject_supplier_image_search_evidence_mutation"();

CREATE FUNCTION "lock_supplier_image_search_evidence_parents"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
BEGIN
  PERFORM 1
  FROM "organizations"
  WHERE "id" = NEW."organizationId"
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'supplier image-search organization binding mismatch'
      USING ERRCODE = '23503';
  END IF;

  IF NEW."workspaceId" IS NOT NULL THEN
    PERFORM 1
    FROM "workspaces"
    WHERE "id" = NEW."workspaceId"
      AND "organizationId" = NEW."organizationId"
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'supplier image-search workspace binding mismatch'
        USING ERRCODE = '23503';
    END IF;
  END IF;

  PERFORM 1
  FROM "product_research_runs"
  WHERE "id" = NEW."researchRunId"
    AND "organizationId" = NEW."organizationId"
    AND "workspaceId" IS NOT DISTINCT FROM NEW."workspaceId"
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'supplier image-search research run binding mismatch'
      USING ERRCODE = '23503';
  END IF;

  PERFORM 1
  FROM "product_candidates"
  WHERE "id" = NEW."candidateId"
    AND "organizationId" = NEW."organizationId"
    AND "researchRunId" = NEW."researchRunId"
    AND "workspaceId" IS NOT DISTINCT FROM NEW."workspaceId"
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'supplier image-search candidate binding mismatch'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "lock_supplier_image_search_evidence_parents"() FROM PUBLIC;

CREATE TRIGGER "supplier_image_search_evidence_parent_lock"
BEFORE INSERT ON "supplier_image_search_evidence"
FOR EACH ROW
EXECUTE FUNCTION "lock_supplier_image_search_evidence_parents"();

CREATE FUNCTION "reject_supplier_image_search_workspace_rebinding"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
BEGIN
  IF OLD."organizationId" IS DISTINCT FROM NEW."organizationId"
     AND (
       EXISTS (
         SELECT 1
         FROM "supplier_image_search_evidence"
         WHERE "workspaceId" = OLD."id"
       )
       OR EXISTS (
         SELECT 1
         FROM "product_research_source_health"
         WHERE "source" = 'supplier_image_search'
           AND "workspaceId" = OLD."id"
           AND "organizationId" = OLD."organizationId"
           AND "metadata" ? 'allocation'
       )
     ) THEN
    RAISE EXCEPTION 'workspace binding is referenced by immutable supplier image-search evidence'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "reject_supplier_image_search_workspace_rebinding"() FROM PUBLIC;

CREATE TRIGGER "supplier_image_search_workspace_binding_guard"
BEFORE UPDATE OF "organizationId" ON "workspaces"
FOR EACH ROW
EXECUTE FUNCTION "reject_supplier_image_search_workspace_rebinding"();

CREATE FUNCTION "reject_supplier_image_search_research_run_rebinding"()
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
       EXISTS (
         SELECT 1
         FROM "supplier_image_search_evidence"
         WHERE "researchRunId" = OLD."id"
       )
       OR EXISTS (
         SELECT 1
         FROM "product_research_source_health"
         WHERE "source" = 'supplier_image_search'
           AND "researchRunId" = OLD."id"
           AND "organizationId" = OLD."organizationId"
           AND "metadata" ? 'allocation'
       )
     ) THEN
    RAISE EXCEPTION 'research run binding is referenced by immutable supplier image-search evidence'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "reject_supplier_image_search_research_run_rebinding"() FROM PUBLIC;

CREATE TRIGGER "supplier_image_search_research_run_binding_guard"
BEFORE UPDATE OF "organizationId", "workspaceId" ON "product_research_runs"
FOR EACH ROW
EXECUTE FUNCTION "reject_supplier_image_search_research_run_rebinding"();

CREATE FUNCTION "reject_supplier_image_search_candidate_rebinding"()
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
    EXISTS (
      SELECT 1
      FROM "supplier_image_search_evidence"
      WHERE "candidateId" = OLD."id"
    )
    OR EXISTS (
      SELECT 1
      FROM "product_research_source_health" AS source_health
      WHERE source_health."source" = 'supplier_image_search'
        AND source_health."researchRunId" = OLD."researchRunId"
        AND source_health."organizationId" = OLD."organizationId"
        AND source_health."metadata" ? 'allocation'
        AND CASE
          WHEN jsonb_typeof(
            source_health."metadata" #> '{allocation,consideredCandidateIds}'
          ) = 'array'
          THEN EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(
              source_health."metadata" #> '{allocation,consideredCandidateIds}'
            ) AS allocated_candidate(candidate_id)
            WHERE allocated_candidate.candidate_id = OLD."id"
          )
          ELSE FALSE
        END
    )
  INTO binding_referenced;

  IF TG_OP = 'DELETE' THEN
    IF binding_referenced THEN
      RAISE EXCEPTION 'candidate is referenced by immutable supplier image-search evidence or allocation'
        USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF (
       OLD."id" IS DISTINCT FROM NEW."id"
       OR OLD."organizationId" IS DISTINCT FROM NEW."organizationId"
       OR OLD."workspaceId" IS DISTINCT FROM NEW."workspaceId"
       OR OLD."researchRunId" IS DISTINCT FROM NEW."researchRunId"
     )
     AND binding_referenced THEN
    RAISE EXCEPTION 'candidate binding is referenced by immutable supplier image-search evidence or allocation'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "reject_supplier_image_search_candidate_rebinding"() FROM PUBLIC;

CREATE TRIGGER "supplier_image_search_candidate_binding_guard"
BEFORE UPDATE OF "id", "organizationId", "workspaceId", "researchRunId" ON "product_candidates"
FOR EACH ROW
EXECUTE FUNCTION "reject_supplier_image_search_candidate_rebinding"();

CREATE TRIGGER "supplier_image_search_candidate_delete_guard"
BEFORE DELETE ON "product_candidates"
FOR EACH ROW
EXECUTE FUNCTION "reject_supplier_image_search_candidate_rebinding"();

CREATE FUNCTION "reject_supplier_image_search_allocation_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."source" = 'supplier_image_search'
       AND OLD."metadata" ? 'allocation' THEN
      RAISE EXCEPTION 'supplier image-search allocation is immutable'
        USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."source" = 'supplier_image_search'
     AND OLD."metadata" ? 'allocation'
     AND (
       OLD."source" IS DISTINCT FROM NEW."source"
       OR OLD."organizationId" IS DISTINCT FROM NEW."organizationId"
       OR OLD."workspaceId" IS DISTINCT FROM NEW."workspaceId"
       OR OLD."researchRunId" IS DISTINCT FROM NEW."researchRunId"
       OR OLD."metadata"->'allocation' IS DISTINCT FROM NEW."metadata"->'allocation'
     ) THEN
    RAISE EXCEPTION 'supplier image-search allocation is immutable'
      USING ERRCODE = '55000';
  END IF;

  IF NOT (OLD."metadata" ? 'allocation')
     AND NEW."metadata" ? 'allocation'
     AND (
       NEW."source" <> 'supplier_image_search'
       OR OLD."source" IS DISTINCT FROM NEW."source"
       OR OLD."organizationId" IS DISTINCT FROM NEW."organizationId"
       OR OLD."workspaceId" IS DISTINCT FROM NEW."workspaceId"
       OR OLD."researchRunId" IS DISTINCT FROM NEW."researchRunId"
     ) THEN
    RAISE EXCEPTION 'supplier image-search allocation must bind to its existing parent chain'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "supplier_image_search_allocation_immutable_guard"
BEFORE UPDATE OR DELETE ON "product_research_source_health"
FOR EACH ROW
EXECUTE FUNCTION "reject_supplier_image_search_allocation_mutation"();

ALTER TABLE "supplier_image_search_evidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_image_search_evidence" FORCE ROW LEVEL SECURITY;

CREATE POLICY "supplier_image_search_evidence_select"
ON "supplier_image_search_evidence"
FOR SELECT
USING (
  "organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')
  AND EXISTS (
    SELECT 1
    FROM "organizations" AS organization
    WHERE organization."id" = "supplier_image_search_evidence"."organizationId"
  )
  AND EXISTS (
    SELECT 1
    FROM "product_research_runs" AS research_run
    WHERE research_run."id" = "supplier_image_search_evidence"."researchRunId"
      AND research_run."organizationId" = "supplier_image_search_evidence"."organizationId"
      AND research_run."workspaceId" IS NOT DISTINCT FROM "supplier_image_search_evidence"."workspaceId"
  )
  AND EXISTS (
    SELECT 1
    FROM "product_candidates" AS candidate
    WHERE candidate."id" = "supplier_image_search_evidence"."candidateId"
      AND candidate."organizationId" = "supplier_image_search_evidence"."organizationId"
      AND candidate."researchRunId" = "supplier_image_search_evidence"."researchRunId"
      AND candidate."workspaceId" IS NOT DISTINCT FROM "supplier_image_search_evidence"."workspaceId"
  )
  AND (
    "workspaceId" IS NULL
    OR EXISTS (
      SELECT 1
      FROM "workspaces" AS workspace
      WHERE workspace."id" = "supplier_image_search_evidence"."workspaceId"
        AND workspace."organizationId" = "supplier_image_search_evidence"."organizationId"
    )
  )
);

CREATE POLICY "supplier_image_search_evidence_insert"
ON "supplier_image_search_evidence"
FOR INSERT
WITH CHECK (
  "organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')
  AND EXISTS (
    SELECT 1
    FROM "organizations" AS organization
    WHERE organization."id" = "supplier_image_search_evidence"."organizationId"
  )
  AND EXISTS (
    SELECT 1
    FROM "product_research_runs" AS research_run
    WHERE research_run."id" = "supplier_image_search_evidence"."researchRunId"
      AND research_run."organizationId" = "supplier_image_search_evidence"."organizationId"
      AND research_run."workspaceId" IS NOT DISTINCT FROM "supplier_image_search_evidence"."workspaceId"
  )
  AND EXISTS (
    SELECT 1
    FROM "product_candidates" AS candidate
    WHERE candidate."id" = "supplier_image_search_evidence"."candidateId"
      AND candidate."organizationId" = "supplier_image_search_evidence"."organizationId"
      AND candidate."researchRunId" = "supplier_image_search_evidence"."researchRunId"
      AND candidate."workspaceId" IS NOT DISTINCT FROM "supplier_image_search_evidence"."workspaceId"
  )
  AND (
    "workspaceId" IS NULL
    OR EXISTS (
      SELECT 1
      FROM "workspaces" AS workspace
      WHERE workspace."id" = "supplier_image_search_evidence"."workspaceId"
        AND workspace."organizationId" = "supplier_image_search_evidence"."organizationId"
    )
  )
);

DO $supplier_image_search_app_role_grant$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'shopmate_app') THEN
    EXECUTE 'GRANT SELECT, INSERT ON "supplier_image_search_evidence" TO "shopmate_app"';
    EXECUTE 'REVOKE UPDATE, DELETE ON "supplier_image_search_evidence" FROM "shopmate_app"';
  END IF;
END
$supplier_image_search_app_role_grant$;

ALTER TABLE "supplier_quote_evidence"
ADD COLUMN "workspaceScopeKey" TEXT;

UPDATE "supplier_quote_evidence"
SET "workspaceScopeKey" = CASE
  WHEN "workspaceId" IS NULL THEN 'workspace:empty'
  ELSE 'workspace:id:' || "workspaceId"
END;

ALTER TABLE "supplier_quote_evidence"
ALTER COLUMN "workspaceScopeKey" SET NOT NULL;

ALTER TABLE "supplier_quote_evidence"
ADD CONSTRAINT "supplier_quote_evidence_workspace_scope_check" CHECK (
  "workspaceScopeKey" = CASE
    WHEN "workspaceId" IS NULL THEN 'workspace:empty'
    ELSE 'workspace:id:' || "workspaceId"
  END
);

DO $supplier_quote_verified_snapshot_preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "supplier_quote_evidence"
    WHERE "verificationStatus" = 'VERIFIED'
      AND "rawSnapshotRef" IS NULL
  ) THEN
    RAISE EXCEPTION 'VERIFIED supplier quote evidence requires a raw snapshot reference before hardening';
  END IF;
END
$supplier_quote_verified_snapshot_preflight$;

ALTER TABLE "supplier_quote_evidence"
ADD CONSTRAINT "supplier_quote_evidence_verified_snapshot_check" CHECK (
  (
    "rawSnapshotRef" IS NULL
    OR "rawSnapshotRef" =
      'supplier-quotes/' || "organizationId" || '/raw/' || "rawSnapshotSha256"
  )
  AND (
    "verificationStatus" <> 'VERIFIED'
    OR "rawSnapshotRef" IS NOT NULL
  )
);

DROP INDEX "supplier_quote_evidence_organizationId_dedupeKey_key";
DROP INDEX "supplier_quote_evidence_organizationId_provider_requestId_key";

CREATE UNIQUE INDEX "supplier_quote_evidence_organizationId_workspaceScopeKey_dedupeKey_key"
ON "supplier_quote_evidence"("organizationId", "workspaceScopeKey", "dedupeKey");

CREATE UNIQUE INDEX "supplier_quote_evidence_organizationId_workspaceScopeKey_provider_requestId_key"
ON "supplier_quote_evidence"("organizationId", "workspaceScopeKey", "provider", "requestId");

CREATE FUNCTION "lock_supplier_quote_evidence_parents"()
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
    RAISE EXCEPTION 'supplier quote organization binding mismatch'
      USING ERRCODE = '23503';
  END IF;

  IF NEW."workspaceId" IS NOT NULL THEN
    PERFORM 1
    FROM "workspaces"
    WHERE "id" = NEW."workspaceId"
      AND "organizationId" = NEW."organizationId"
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'supplier quote workspace binding mismatch'
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
    RAISE EXCEPTION 'supplier quote research run binding mismatch'
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
    RAISE EXCEPTION 'supplier quote candidate binding mismatch'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "lock_supplier_quote_evidence_parents"() FROM PUBLIC;

CREATE TRIGGER "supplier_quote_evidence_parent_lock"
BEFORE INSERT ON "supplier_quote_evidence"
FOR EACH ROW
EXECUTE FUNCTION "lock_supplier_quote_evidence_parents"();

CREATE FUNCTION "reject_supplier_quote_workspace_rebinding"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
BEGIN
  IF OLD."organizationId" IS DISTINCT FROM NEW."organizationId"
     AND EXISTS (
       SELECT 1
       FROM "supplier_quote_evidence"
       WHERE "workspaceId" = OLD."id"
     ) THEN
    RAISE EXCEPTION 'workspace binding is referenced by immutable supplier quote evidence'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "reject_supplier_quote_workspace_rebinding"() FROM PUBLIC;

CREATE TRIGGER "supplier_quote_evidence_workspace_binding_guard"
BEFORE UPDATE OF "organizationId" ON "workspaces"
FOR EACH ROW
EXECUTE FUNCTION "reject_supplier_quote_workspace_rebinding"();

CREATE FUNCTION "reject_supplier_quote_research_run_rebinding"()
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
     AND EXISTS (
       SELECT 1
       FROM "supplier_quote_evidence"
       WHERE "researchRunId" = OLD."id"
     ) THEN
    RAISE EXCEPTION 'research run binding is referenced by immutable supplier quote evidence'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "reject_supplier_quote_research_run_rebinding"() FROM PUBLIC;

CREATE TRIGGER "supplier_quote_evidence_research_run_binding_guard"
BEFORE UPDATE OF "organizationId", "workspaceId" ON "product_research_runs"
FOR EACH ROW
EXECUTE FUNCTION "reject_supplier_quote_research_run_rebinding"();

CREATE FUNCTION "reject_supplier_quote_candidate_rebinding"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  binding_referenced BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM "supplier_quote_evidence"
    WHERE "candidateId" = OLD."id"
  )
  INTO binding_referenced;

  IF TG_OP = 'DELETE' THEN
    IF binding_referenced THEN
      RAISE EXCEPTION 'candidate is referenced by immutable supplier quote evidence'
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
    RAISE EXCEPTION 'candidate binding is referenced by immutable supplier quote evidence'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "reject_supplier_quote_candidate_rebinding"() FROM PUBLIC;

CREATE TRIGGER "supplier_quote_evidence_candidate_binding_guard"
BEFORE UPDATE OF "id", "organizationId", "workspaceId", "researchRunId" ON "product_candidates"
FOR EACH ROW
EXECUTE FUNCTION "reject_supplier_quote_candidate_rebinding"();

CREATE TRIGGER "supplier_quote_evidence_candidate_delete_guard"
BEFORE DELETE ON "product_candidates"
FOR EACH ROW
EXECUTE FUNCTION "reject_supplier_quote_candidate_rebinding"();

DROP POLICY "supplier_quote_evidence_select" ON "supplier_quote_evidence";
DROP POLICY "supplier_quote_evidence_insert" ON "supplier_quote_evidence";

CREATE POLICY "supplier_quote_evidence_select"
ON "supplier_quote_evidence"
FOR SELECT
USING (
  "organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')
  AND EXISTS (
    SELECT 1
    FROM "organizations" AS organization
    WHERE organization."id" = "supplier_quote_evidence"."organizationId"
  )
  AND EXISTS (
    SELECT 1
    FROM "product_research_runs" AS research_run
    WHERE research_run."id" = "supplier_quote_evidence"."researchRunId"
      AND research_run."organizationId" = "supplier_quote_evidence"."organizationId"
      AND research_run."workspaceId" IS NOT DISTINCT FROM "supplier_quote_evidence"."workspaceId"
  )
  AND EXISTS (
    SELECT 1
    FROM "product_candidates" AS candidate
    WHERE candidate."id" = "supplier_quote_evidence"."candidateId"
      AND candidate."organizationId" = "supplier_quote_evidence"."organizationId"
      AND candidate."researchRunId" = "supplier_quote_evidence"."researchRunId"
      AND candidate."workspaceId" IS NOT DISTINCT FROM "supplier_quote_evidence"."workspaceId"
  )
  AND (
    "workspaceId" IS NULL
    OR EXISTS (
      SELECT 1
      FROM "workspaces" AS workspace
      WHERE workspace."id" = "supplier_quote_evidence"."workspaceId"
        AND workspace."organizationId" = "supplier_quote_evidence"."organizationId"
    )
  )
);

CREATE POLICY "supplier_quote_evidence_insert"
ON "supplier_quote_evidence"
FOR INSERT
WITH CHECK (
  "organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')
  AND EXISTS (
    SELECT 1
    FROM "organizations" AS organization
    WHERE organization."id" = "supplier_quote_evidence"."organizationId"
  )
  AND EXISTS (
    SELECT 1
    FROM "product_research_runs" AS research_run
    WHERE research_run."id" = "supplier_quote_evidence"."researchRunId"
      AND research_run."organizationId" = "supplier_quote_evidence"."organizationId"
      AND research_run."workspaceId" IS NOT DISTINCT FROM "supplier_quote_evidence"."workspaceId"
  )
  AND EXISTS (
    SELECT 1
    FROM "product_candidates" AS candidate
    WHERE candidate."id" = "supplier_quote_evidence"."candidateId"
      AND candidate."organizationId" = "supplier_quote_evidence"."organizationId"
      AND candidate."researchRunId" = "supplier_quote_evidence"."researchRunId"
      AND candidate."workspaceId" IS NOT DISTINCT FROM "supplier_quote_evidence"."workspaceId"
  )
  AND (
    "workspaceId" IS NULL
    OR EXISTS (
      SELECT 1
      FROM "workspaces" AS workspace
      WHERE workspace."id" = "supplier_quote_evidence"."workspaceId"
        AND workspace."organizationId" = "supplier_quote_evidence"."organizationId"
    )
  )
);

DO $supplier_quote_app_role_grant$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'shopmate_app') THEN
    EXECUTE 'GRANT SELECT, INSERT ON "supplier_quote_evidence" TO "shopmate_app"';
    EXECUTE 'REVOKE UPDATE, DELETE ON "supplier_quote_evidence" FROM "shopmate_app"';
  END IF;
END
$supplier_quote_app_role_grant$;

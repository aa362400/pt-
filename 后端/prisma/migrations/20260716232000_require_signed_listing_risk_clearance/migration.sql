-- Require both candidate-level and final-listing signed risk evidence before a
-- v3 publish snapshot can enter the immutable outbound ledger. PostgreSQL
-- validates the complete binding and signature shape; the backend separately
-- verifies the deployment-owned HMAC secret before insertion and dispatch.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE OR REPLACE FUNCTION "validate_listing_publish_snapshot_signed_risk"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  candidate_risk JSONB;
  candidate_attestation JSONB;
  listing_risk JSONB;
  listing_subject JSONB;
  listing_clearance JSONB;
  listing_attestation JSONB;
  listing_screening JSONB;
  candidate_fetched_at TIMESTAMPTZ;
  candidate_expires_at TIMESTAMPTZ;
  listing_fetched_at TIMESTAMPTZ;
  listing_expires_at TIMESTAMPTZ;
BEGIN
  candidate_risk := NEW."snapshot"#>'{safetyEvidence,risk}';
  listing_risk := candidate_risk->'listing';
  listing_subject := listing_risk->'subject';
  listing_clearance := listing_risk->'clearanceEvidence';
  listing_attestation := listing_clearance->'attestation';
  listing_screening := listing_risk->'screening';

  SELECT risk."evidence"
  INTO candidate_risk
  FROM "product_risk_records" AS risk
  WHERE risk."id" = NEW."snapshot"#>>'{safetyEvidence,risk,clearanceRecordId}'
    AND risk."organizationId" = NEW."organizationId"
    AND risk."riskType" = 'RISK_CLEARANCE_ATTESTED'
    AND risk."severity" = 'LOW'
    AND risk."reviewStatus" IN ('AUTO', 'CONFIRMED')
    AND risk."source" = risk."evidence"#>>'{attestation,provider}'
    AND risk."ruleVersion" = risk."evidence"#>>'{attestation,ruleset}'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'candidate signed risk clearance binding mismatch'
      USING ERRCODE = '23503';
  END IF;

  candidate_attestation := candidate_risk->'attestation';
  IF candidate_risk->>'schemaVersion' <> 'risk-clearance-evidence/v1'
     OR candidate_risk->>'subjectVersion' <> 'listing-risk-subject/v1'
     OR COALESCE(candidate_risk->>'evidenceHash', '') !~ '^[a-f0-9]{64}$'
     OR candidate_risk->>'evidenceHash' IS DISTINCT FROM
       NEW."snapshot"#>>'{safetyEvidence,risk,evidenceHash}'
     OR candidate_attestation->>'passed' <> 'true'
     OR COALESCE(candidate_attestation->>'provider', '') = ''
     OR COALESCE(candidate_attestation->>'ruleset', '') = ''
     OR COALESCE(candidate_attestation->>'evidenceRef', '') = ''
     OR COALESCE(candidate_attestation->>'subjectHash', '')
       !~ '^sha256:[a-f0-9]{64}$'
     OR COALESCE(candidate_attestation->>'signature', '')
       !~ '^hmac-sha256:[a-f0-9]{64}$'
     OR candidate_attestation->>'fetchedAt' IS DISTINCT FROM
       NEW."snapshot"#>>'{safetyEvidence,risk,fetchedAt}' THEN
    RAISE EXCEPTION 'candidate signed risk clearance shape is invalid'
      USING ERRCODE = '23514';
  END IF;
  candidate_fetched_at := (candidate_attestation->>'fetchedAt')::TIMESTAMPTZ;
  candidate_expires_at := (candidate_attestation->>'expiresAt')::TIMESTAMPTZ;
  IF candidate_expires_at <= candidate_fetched_at
     OR candidate_fetched_at > CURRENT_TIMESTAMP + INTERVAL '5 minutes'
     OR candidate_expires_at <= CURRENT_TIMESTAMP THEN
    RAISE EXCEPTION 'candidate signed risk clearance is stale'
      USING ERRCODE = '23514';
  END IF;

  IF listing_risk->>'schemaVersion' <>
       'listing-final-risk-clearance/v1'
     OR listing_risk->>'subjectVersion' <> 'listing-risk-subject/v1'
     OR COALESCE(listing_risk->>'subjectHash', '')
       !~ '^sha256:[a-f0-9]{64}$'
     OR COALESCE(listing_risk->>'evidenceHash', '') !~ '^[a-f0-9]{64}$'
     OR listing_subject->>'scopeId' IS DISTINCT FROM
       'listing:' || NEW."organizationId" || ':' || NEW."listingDraftId"
     OR lower(COALESCE(listing_subject->>'platform', '')) <> 'ozon'
     OR listing_subject->>'title' IS DISTINCT FROM
       NEW."snapshot"#>>'{canonicalProduct,identity,title}'
     OR jsonb_typeof(listing_subject->'bullets') <> 'array'
     OR jsonb_typeof(listing_subject->'keywords') <> 'array'
     OR jsonb_typeof(listing_subject->'attributes') <> 'object'
     OR jsonb_typeof(listing_subject->'imageHashes') <> 'array'
     OR jsonb_array_length(listing_subject->'imageHashes') = 0
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements_text(listing_subject->'imageHashes')
         AS image_hash(value)
       WHERE image_hash.value !~ '^sha256:[a-f0-9]{64}$'
     ) THEN
    RAISE EXCEPTION 'final listing risk subject binding is invalid'
      USING ERRCODE = '23514';
  END IF;

  IF listing_clearance->>'schemaVersion' <> 'risk-clearance-evidence/v1'
     OR listing_clearance->>'subjectVersion' <> 'listing-risk-subject/v1'
     OR listing_clearance->>'evidenceHash' IS DISTINCT FROM
       listing_risk->>'evidenceHash'
     OR listing_attestation->>'provider' IS DISTINCT FROM
       listing_risk->>'provider'
     OR listing_attestation->>'ruleset' IS DISTINCT FROM
       listing_risk->>'ruleset'
     OR listing_attestation->>'fetchedAt' IS DISTINCT FROM
       listing_risk->>'fetchedAt'
     OR listing_attestation->>'expiresAt' IS DISTINCT FROM
       listing_risk->>'expiresAt'
     OR listing_attestation->>'subjectHash' IS DISTINCT FROM
       listing_risk->>'subjectHash'
     OR listing_attestation->>'passed' <> 'true'
     OR COALESCE(listing_attestation->>'evidenceRef', '') = ''
     OR COALESCE(listing_attestation->>'signature', '')
       !~ '^hmac-sha256:[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'final listing signed clearance shape is invalid'
      USING ERRCODE = '23514';
  END IF;
  listing_fetched_at := (listing_attestation->>'fetchedAt')::TIMESTAMPTZ;
  listing_expires_at := (listing_attestation->>'expiresAt')::TIMESTAMPTZ;
  IF listing_expires_at <= listing_fetched_at
     OR listing_fetched_at > CURRENT_TIMESTAMP + INTERVAL '5 minutes'
     OR listing_expires_at <= CURRENT_TIMESTAMP THEN
    RAISE EXCEPTION 'final listing signed clearance is stale'
      USING ERRCODE = '23514';
  END IF;

  IF listing_screening->>'decision' <> 'PASS'
     OR listing_screening->>'screeningStatus' <> 'CLEARED'
     OR listing_screening->>'evidenceStatus' <> 'ATTESTED'
     OR listing_screening->>'publishable' <> 'true'
     OR jsonb_typeof(listing_screening->'hardGateReasons') <> 'array'
     OR jsonb_array_length(listing_screening->'hardGateReasons') <> 0
     OR COALESCE(listing_screening->>'mcpManifestHash', '')
       !~ '^[a-f0-9]{64}$'
     OR COALESCE(listing_screening->>'mcpExecutableHash', '')
       !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'final listing trusted risk screening did not pass'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN invalid_text_representation OR datetime_field_overflow THEN
    RAISE EXCEPTION 'signed risk clearance timestamps are invalid'
      USING ERRCODE = '23514';
END;
$$;

REVOKE ALL ON FUNCTION
  "validate_listing_publish_snapshot_signed_risk"() FROM PUBLIC;

DROP TRIGGER IF EXISTS
  "listing_publish_snapshots_signed_risk_guard"
  ON "listing_publish_snapshots";
CREATE TRIGGER "listing_publish_snapshots_signed_risk_guard"
BEFORE INSERT ON "listing_publish_snapshots"
FOR EACH ROW
EXECUTE FUNCTION "validate_listing_publish_snapshot_signed_risk"();

CREATE OR REPLACE FUNCTION "protect_signed_risk_clearance_record"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
BEGIN
  IF OLD."riskType" = 'RISK_CLEARANCE_ATTESTED' THEN
    RAISE EXCEPTION 'signed risk clearance records are append-only'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "protect_signed_risk_clearance_record"() FROM PUBLIC;

DROP TRIGGER IF EXISTS "signed_risk_clearance_immutable"
  ON "product_risk_records";
CREATE TRIGGER "signed_risk_clearance_immutable"
BEFORE UPDATE OR DELETE ON "product_risk_records"
FOR EACH ROW
EXECUTE FUNCTION "protect_signed_risk_clearance_record"();

COMMIT;

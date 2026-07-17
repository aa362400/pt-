-- Fail closed when immutable economics or signed risk proof JSON omits
-- required fields. The preceding applied migrations remain unchanged.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE OR REPLACE FUNCTION "validate_listing_publish_snapshot_economics_chain"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  evaluation_candidate_id TEXT;
  evaluation_sale_price NUMERIC;
  evaluation_currency TEXT;
  evaluation_gross_margin NUMERIC;
  evaluation_net_profit NUMERIC;
  evaluation_net_margin NUMERIC;
  evaluation_policy JSONB;
  evaluation_roles TEXT[];
  dispatch_buffer_seconds INTEGER;
  maximum_evidence_age_seconds INTEGER;
  risk_clearance_id TEXT;
  risk_fetched_at TIMESTAMPTZ;
  proof_count INTEGER;
BEGIN
  proof_count :=
    (NEW."economicsEvaluationId" IS NOT NULL)::INTEGER
    + (NEW."economicsEvaluationHash" IS NOT NULL)::INTEGER
    + (NEW."economicsInputSetHash" IS NOT NULL)::INTEGER
    + (NEW."economicsValidUntil" IS NOT NULL)::INTEGER;

  -- Outcome/status updates must remain possible after the approval evidence
  -- expires. A separate immutable-payload trigger prevents proof rebinding.
  IF TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF proof_count IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'listing publish snapshot requires a complete economics proof'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    evaluation."candidateId",
    evaluation."salePrice",
    evaluation."currency",
    evaluation."grossMarginBeforeAds",
    evaluation."netProfitAfterAds",
    evaluation."netMarginAfterAds",
    evaluation."policySnapshot"
  INTO
    evaluation_candidate_id,
    evaluation_sale_price,
    evaluation_currency,
    evaluation_gross_margin,
    evaluation_net_profit,
    evaluation_net_margin,
    evaluation_policy
  FROM "candidate_economics_evaluations" AS evaluation
  WHERE evaluation."id" = NEW."economicsEvaluationId"
    AND evaluation."organizationId" = NEW."organizationId"
    AND evaluation."contentHash" = NEW."economicsEvaluationHash"
    AND evaluation."inputSetHash" = NEW."economicsInputSetHash"
    AND evaluation."validUntil" = NEW."economicsValidUntil"
    AND evaluation."status" = 'VERIFIED'
    AND evaluation."decision" = 'PASS'
    AND cardinality(evaluation."hardGateReasons") = 0
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'listing publish snapshot economics evaluation mismatch'
      USING ERRCODE = '23503';
  END IF;

  IF evaluation_gross_margin IS NULL
     OR evaluation_net_profit IS NULL
     OR evaluation_net_margin IS NULL
     OR evaluation_gross_margin < 0.5
     OR evaluation_net_profit <= 0
     OR evaluation_net_margin <= 0 THEN
    RAISE EXCEPTION 'listing publish snapshot economics thresholds failed'
      USING ERRCODE = '23514';
  END IF;

  SELECT array_agg(input."role" ORDER BY input."role")
  INTO evaluation_roles
  FROM "candidate_economics_evaluation_inputs" AS input
  WHERE input."evaluationId" = NEW."economicsEvaluationId";

  IF evaluation_roles IS DISTINCT FROM ARRAY[
       'ADVERTISING', 'DOMESTIC_TRANSPORT', 'FX_VOLATILITY_RESERVE',
       'OZON_COMMISSION', 'OZON_FULFILLMENT', 'OZON_PAYMENT',
       'OZON_STORAGE', 'PACKAGING', 'REFUND_LOSS', 'SALE_PRICE', 'TAX'
     ]::TEXT[]
     AND evaluation_roles IS DISTINCT FROM ARRAY[
       'ADVERTISING', 'DOMESTIC_TRANSPORT', 'FX_RATE',
       'FX_VOLATILITY_RESERVE', 'OZON_COMMISSION', 'OZON_FULFILLMENT',
       'OZON_PAYMENT', 'OZON_STORAGE', 'PACKAGING', 'REFUND_LOSS',
       'SALE_PRICE', 'TAX'
     ]::TEXT[] THEN
    RAISE EXCEPTION 'listing publish snapshot economics input membership is incomplete'
      USING ERRCODE = '23514';
  END IF;

  IF evaluation_policy IS NULL
     OR jsonb_typeof(evaluation_policy->'dispatchFreshnessBufferSeconds') IS DISTINCT FROM 'number'
     OR jsonb_typeof(evaluation_policy->'maxEvidenceAgeSeconds') IS DISTINCT FROM 'number'
     OR COALESCE(evaluation_policy->>'dispatchFreshnessBufferSeconds', '') !~ '^\d+$'
     OR COALESCE(evaluation_policy->>'maxEvidenceAgeSeconds', '') !~ '^\d+$' THEN
    RAISE EXCEPTION 'listing publish snapshot economics policy freshness is invalid'
      USING ERRCODE = '23514';
  END IF;
  dispatch_buffer_seconds :=
    (evaluation_policy->>'dispatchFreshnessBufferSeconds')::INTEGER;
  maximum_evidence_age_seconds :=
    (evaluation_policy->>'maxEvidenceAgeSeconds')::INTEGER;
  IF dispatch_buffer_seconds NOT BETWEEN 60 AND 86400
     OR maximum_evidence_age_seconds NOT BETWEEN 60 AND 2678400
     OR NEW."economicsValidUntil" <=
       CURRENT_TIMESTAMP + make_interval(secs => dispatch_buffer_seconds) THEN
    RAISE EXCEPTION 'listing publish snapshot economics proof is stale'
      USING ERRCODE = '23514';
  END IF;

  PERFORM 1 FROM "product_launches"
  WHERE "id" = NEW."productLaunchId"
    AND "organizationId" = NEW."organizationId"
    AND "researchCandidateId" = evaluation_candidate_id
    AND "economicsEvaluationId" = NEW."economicsEvaluationId"
    AND "economicsEvaluationHash" = NEW."economicsEvaluationHash"
    AND EXISTS (
      SELECT 1 FROM "product_candidates" AS candidate
      WHERE candidate."id" = evaluation_candidate_id
        AND candidate."organizationId" = NEW."organizationId"
        AND candidate."status" = 'RECOMMENDED'
    )
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'listing publish snapshot product launch proof mismatch'
      USING ERRCODE = '23503';
  END IF;

  IF NEW."schemaVersion" IS DISTINCT FROM 'listing-publish-snapshot/v3'
     OR NEW."snapshot"->>'schemaVersion' IS DISTINCT FROM 'listing-publish-snapshot/v3'
     OR NEW."snapshot"#>>'{economics,evaluationId}' IS DISTINCT FROM
       NEW."economicsEvaluationId"
     OR NEW."snapshot"#>>'{economics,contentHash}' IS DISTINCT FROM
       NEW."economicsEvaluationHash"
     OR NEW."snapshot"#>>'{economics,inputSetHash}' IS DISTINCT FROM
       NEW."economicsInputSetHash"
     OR NEW."snapshot"#>>'{economics,validUntil}' IS DISTINCT FROM
       to_char(NEW."economicsValidUntil" AT TIME ZONE 'UTC',
         'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
     OR NEW."snapshot"#>>'{economics,status}' IS DISTINCT FROM 'VERIFIED'
     OR NEW."snapshot"#>>'{economics,decision}' IS DISTINCT FROM 'PASS'
     OR NEW."snapshot"#>>'{economics,source}' IS DISTINCT FROM
       'candidate_economics_evaluations'
     OR NEW."snapshot"#>>'{economics,currency}' IS DISTINCT FROM
       evaluation_currency
     OR COALESCE(NEW."snapshot"#>>'{economics,price}', '') !~ '^\d+(\.\d+)?$'
     OR COALESCE(NEW."snapshot"#>>'{payload,price}', '') !~ '^\d+(\.\d+)?$'
     OR (NEW."snapshot"#>>'{economics,price}')::NUMERIC IS DISTINCT FROM
       evaluation_sale_price
     OR (NEW."snapshot"#>>'{payload,price}')::NUMERIC IS DISTINCT FROM
       evaluation_sale_price THEN
    RAISE EXCEPTION 'listing publish snapshot JSON economics binding mismatch'
      USING ERRCODE = '23514';
  END IF;

  risk_clearance_id :=
    NEW."snapshot"#>>'{safetyEvidence,risk,clearanceRecordId}';
  IF NEW."snapshot"#>>'{safetyEvidence,risk,source}' IS DISTINCT FROM
       'product_risk_records'
     OR COALESCE(NEW."snapshot"#>>'{safetyEvidence,risk,evidenceHash}', '')
       !~ '^[a-f0-9]{64}$'
     OR COALESCE(NEW."snapshot"#>>'{safetyEvidence,risk,fetchedAt}', '')
       !~ '^\d{4}-\d{2}-\d{2}T' THEN
    RAISE EXCEPTION 'listing publish snapshot risk proof shape is invalid'
      USING ERRCODE = '23514';
  END IF;
  risk_fetched_at :=
    (NEW."snapshot"#>>'{safetyEvidence,risk,fetchedAt}')::TIMESTAMPTZ;
  IF risk_fetched_at > CURRENT_TIMESTAMP + INTERVAL '5 minutes'
     OR risk_fetched_at < CURRENT_TIMESTAMP
       - make_interval(secs => maximum_evidence_age_seconds) THEN
    RAISE EXCEPTION 'listing publish snapshot risk clearance is stale'
      USING ERRCODE = '23514';
  END IF;

  PERFORM 1 FROM "product_risk_records" AS risk
  WHERE risk."id" = risk_clearance_id
    AND risk."organizationId" = NEW."organizationId"
    AND risk."researchRunId" = (
      SELECT evaluation."researchRunId"
      FROM "candidate_economics_evaluations" AS evaluation
      WHERE evaluation."id" = NEW."economicsEvaluationId"
    )
    AND risk."candidateId" = evaluation_candidate_id
    AND risk."riskType" = 'RISK_CLEARANCE_ATTESTED'
    AND risk."severity" = 'LOW'
    AND risk."reviewStatus" IN ('AUTO', 'CONFIRMED')
    AND char_length(risk."ruleVersion") > 0
    AND char_length(COALESCE(risk."source", '')) > 0
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'listing publish snapshot risk clearance binding mismatch'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
  "validate_listing_publish_snapshot_economics_chain"() FROM PUBLIC;

CREATE OR REPLACE FUNCTION "validate_external_submission_economics_chain"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  evaluation_candidate_id TEXT;
  evaluation_policy JSONB;
  snapshot_valid_until TIMESTAMP(3);
  dispatch_buffer_seconds INTEGER;
  validates_dispatch BOOLEAN;
  proof_count INTEGER;
BEGIN
  proof_count :=
    (NEW."economicsEvaluationId" IS NOT NULL)::INTEGER
    + (NEW."economicsEvaluationHash" IS NOT NULL)::INTEGER;

  validates_dispatch :=
    TG_OP = 'INSERT'
    OR (
      TG_OP = 'UPDATE'
      AND NEW."status" IN ('CLAIMED', 'REQUEST_SENT')
      AND NEW."status" IS DISTINCT FROM OLD."status"
    );
  -- Result/reconciliation updates must remain recordable after expiry. The
  -- immutable-identity trigger separately prevents request/proof rebinding.
  IF NOT validates_dispatch THEN
    RETURN NEW;
  END IF;

  IF proof_count IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'external submission requires a complete economics proof'
      USING ERRCODE = '23514';
  END IF;

  SELECT evaluation."candidateId", evaluation."policySnapshot"
  INTO evaluation_candidate_id, evaluation_policy
  FROM "candidate_economics_evaluations" AS evaluation
  WHERE evaluation."id" = NEW."economicsEvaluationId"
    AND evaluation."organizationId" = NEW."organizationId"
    AND evaluation."contentHash" = NEW."economicsEvaluationHash"
    AND evaluation."status" = 'VERIFIED'
    AND evaluation."decision" = 'PASS'
    AND cardinality(evaluation."hardGateReasons") = 0
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'external submission economics evaluation mismatch'
      USING ERRCODE = '23503';
  END IF;

  IF evaluation_policy IS NULL
     OR jsonb_typeof(evaluation_policy->'dispatchFreshnessBufferSeconds') IS DISTINCT FROM 'number'
     OR COALESCE(evaluation_policy->>'dispatchFreshnessBufferSeconds', '') !~ '^\d+$' THEN
    RAISE EXCEPTION 'external submission economics freshness policy is invalid'
      USING ERRCODE = '23514';
  END IF;
  dispatch_buffer_seconds :=
    (evaluation_policy->>'dispatchFreshnessBufferSeconds')::INTEGER;
  IF dispatch_buffer_seconds NOT BETWEEN 60 AND 86400 THEN
    RAISE EXCEPTION 'external submission economics freshness policy is invalid'
      USING ERRCODE = '23514';
  END IF;

  SELECT snapshot."economicsValidUntil"
  INTO snapshot_valid_until
  FROM "listing_publish_snapshots" AS snapshot
  WHERE snapshot."id" = NEW."publishSnapshotId"
    AND snapshot."organizationId" = NEW."organizationId"
    AND snapshot."productLaunchId" = NEW."productLaunchId"
    AND snapshot."snapshotHash" = NEW."requestHash"
    AND snapshot."economicsEvaluationId" = NEW."economicsEvaluationId"
    AND snapshot."economicsEvaluationHash" = NEW."economicsEvaluationHash"
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'external submission publish snapshot proof mismatch'
      USING ERRCODE = '23503';
  END IF;

  IF snapshot_valid_until <=
       CURRENT_TIMESTAMP + make_interval(secs => dispatch_buffer_seconds) THEN
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

  IF NEW."payloadHash" IS NULL
     OR NEW."payloadHash" !~ '^[a-f0-9]{64}$'
     OR NEW."request"->>'schemaVersion' IS DISTINCT FROM 'external-submission/v3'
     OR NEW."request"#>>'{publishSnapshotId}' IS DISTINCT FROM
       NEW."publishSnapshotId"
     OR NEW."request"#>>'{snapshotHash}' IS DISTINCT FROM NEW."requestHash"
     OR NEW."request"#>>'{payloadHash}' IS DISTINCT FROM NEW."payloadHash"
     OR NEW."request"#>>'{economicsEvaluationId}' IS DISTINCT FROM
       NEW."economicsEvaluationId"
     OR NEW."request"#>>'{economicsEvaluationHash}' IS DISTINCT FROM
       NEW."economicsEvaluationHash" THEN
    RAISE EXCEPTION 'external submission request proof binding mismatch'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
  "validate_external_submission_economics_chain"() FROM PUBLIC;

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
  IF candidate_risk->>'schemaVersion' IS DISTINCT FROM 'risk-clearance-evidence/v1'
     OR candidate_risk->>'subjectVersion' IS DISTINCT FROM 'listing-risk-subject/v1'
     OR COALESCE(candidate_risk->>'evidenceHash', '') !~ '^[a-f0-9]{64}$'
     OR candidate_risk->>'evidenceHash' IS DISTINCT FROM
       NEW."snapshot"#>>'{safetyEvidence,risk,evidenceHash}'
     OR candidate_attestation->>'passed' IS DISTINCT FROM 'true'
     OR COALESCE(candidate_attestation->>'provider', '') = ''
     OR COALESCE(candidate_attestation->>'ruleset', '') = ''
     OR COALESCE(candidate_attestation->>'evidenceRef', '') = ''
     OR COALESCE(candidate_attestation->>'subjectHash', '')
       !~ '^sha256:[a-f0-9]{64}$'
     OR COALESCE(candidate_attestation->>'signature', '')
       !~ '^hmac-sha256:[a-f0-9]{64}$'
     OR COALESCE(candidate_attestation->>'fetchedAt', '') = ''
     OR COALESCE(candidate_attestation->>'expiresAt', '') = ''
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

  IF listing_risk->>'schemaVersion' IS DISTINCT FROM
       'listing-final-risk-clearance/v1'
     OR listing_risk->>'subjectVersion' IS DISTINCT FROM 'listing-risk-subject/v1'
     OR COALESCE(listing_risk->>'subjectHash', '')
       !~ '^sha256:[a-f0-9]{64}$'
     OR COALESCE(listing_risk->>'evidenceHash', '') !~ '^[a-f0-9]{64}$'
     OR listing_subject->>'scopeId' IS DISTINCT FROM
       'listing:' || NEW."organizationId" || ':' || NEW."listingDraftId"
     OR lower(COALESCE(listing_subject->>'platform', '')) IS DISTINCT FROM 'ozon'
     OR listing_subject->>'title' IS DISTINCT FROM
       NEW."snapshot"#>>'{canonicalProduct,identity,title}'
     OR jsonb_typeof(listing_subject->'bullets') IS DISTINCT FROM 'array'
     OR jsonb_typeof(listing_subject->'keywords') IS DISTINCT FROM 'array'
     OR jsonb_typeof(listing_subject->'attributes') IS DISTINCT FROM 'object'
     OR jsonb_typeof(listing_subject->'imageHashes') IS DISTINCT FROM 'array'
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

  IF COALESCE(listing_risk->>'provider', '') = ''
     OR COALESCE(listing_risk->>'ruleset', '') = ''
     OR COALESCE(listing_risk->>'fetchedAt', '') = ''
     OR COALESCE(listing_risk->>'expiresAt', '') = ''
     OR listing_clearance->>'schemaVersion' IS DISTINCT FROM 'risk-clearance-evidence/v1'
     OR listing_clearance->>'subjectVersion' IS DISTINCT FROM 'listing-risk-subject/v1'
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
     OR listing_attestation->>'passed' IS DISTINCT FROM 'true'
     OR COALESCE(listing_attestation->>'evidenceRef', '') = ''
     OR COALESCE(listing_attestation->>'fetchedAt', '') = ''
     OR COALESCE(listing_attestation->>'expiresAt', '') = ''
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

  IF listing_screening->>'decision' IS DISTINCT FROM 'PASS'
     OR listing_screening->>'screeningStatus' IS DISTINCT FROM 'CLEARED'
     OR listing_screening->>'evidenceStatus' IS DISTINCT FROM 'ATTESTED'
     OR listing_screening->>'publishable' IS DISTINCT FROM 'true'
     OR jsonb_typeof(listing_screening->'hardGateReasons') IS DISTINCT FROM 'array'
     OR jsonb_array_length(listing_screening->'hardGateReasons') IS DISTINCT FROM 0
     OR COALESCE(listing_screening->>'mcpManifestHash', '')
       !~ '^[a-f0-9]{64}$'
     OR COALESCE(listing_screening->>'mcpExecutableHash', '')
       !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'final listing trusted risk screening did not pass'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN invalid_text_representation
    OR invalid_datetime_format
    OR datetime_field_overflow THEN
    RAISE EXCEPTION 'signed risk clearance timestamps are invalid'
      USING ERRCODE = '23514';
END;
$$;

REVOKE ALL ON FUNCTION
  "validate_listing_publish_snapshot_signed_risk"() FROM PUBLIC;

-- PostgreSQL does not create an index for the referencing side of a foreign
-- key. Keep user deletion/update cascades bounded as this ledger grows.
CREATE INDEX "listing_generation_requests_userId_idx"
  ON "listing_generation_requests"("userId");

COMMIT;

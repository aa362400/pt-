\set ON_ERROR_STOP on

BEGIN;

SELECT
  candidate.id AS candidate_id,
  candidate."organizationId" AS org_id,
  candidate."workspaceId" AS workspace_id,
  candidate."researchRunId" AS run_id,
  candidate.fingerprint AS candidate_fp,
  review.id AS review_id
FROM product_candidates AS candidate
JOIN review_tasks AS review
  ON review."organizationId" = candidate."organizationId"
WHERE candidate."workspaceId" IS NOT NULL
LIMIT 1
\gset

UPDATE product_candidates
SET status = 'RECOMMENDED'
WHERE id = :'candidate_id';

INSERT INTO supplier_quote_evidence (
  id, "organizationId", "workspaceId", "workspaceScopeKey",
  "researchRunId", "candidateId", "schemaVersion", provider,
  "adapterVersion", "requestId", "evidenceGroupKey", "discoveryMethod",
  "matchStatus", "verificationStatus", "offerId", "offerUrl", "variantId",
  "variantAttributes", quantity, "minimumOrderQuantity", "unitOfMeasure",
  "unitsPerPack", "priceKind", "productUnitAmount", "productTotalAmount",
  "productCurrency", "shippingQuoteId", "shippingScope",
  "shippingDestinationCountry", "shippingDestinationPostalCode",
  "shippingQuantity", "shippingUnitAmount", "shippingTotalAmount",
  "shippingCurrency", "shippingEvidenceUrl", "attributeConflicts",
  "expectedBinding", "normalizedEvidence", "rawSnapshotSha256",
  "rawSnapshotRef", "contentHash", "dedupeKey", "fetchedAt", "verifiedAt",
  "validUntil"
) VALUES (
  'proof-quote', :'org_id', :'workspace_id',
  'workspace:id:' || :'workspace_id', :'run_id', :'candidate_id',
  'supplier-quote-evidence/v1', 'semantic-test', 'v1', 'req-proof',
  'group-proof', 'KEYWORD_SEARCH', 'MATCHED', 'VERIFIED', 'offer-proof',
  'https://example.invalid/offer', 'variant-proof', '{}', 1, 1, 'PIECE', 1,
  'EXACT', 400, 400, 'RUB', 'ship-proof', 'LANDED_RU', 'RU', '101000', 1,
  100, 100, 'RUB', 'https://example.invalid/shipping', '[]', '{}', '{}',
  repeat('a', 64),
  'supplier-quotes/' || :'org_id' || '/raw/' || repeat('a', 64),
  repeat('b', 64), repeat('c', 64), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP + INTERVAL '2 hours'
);

WITH roles(role, ordinal, value_kind) AS (VALUES
  ('ADVERTISING', 0, 'RATE'),
  ('DOMESTIC_TRANSPORT', 1, 'MONEY'),
  ('FX_VOLATILITY_RESERVE', 2, 'RATE'),
  ('OZON_COMMISSION', 3, 'RATE'),
  ('OZON_FULFILLMENT', 4, 'MONEY'),
  ('OZON_PAYMENT', 5, 'RATE_WITH_MINIMUM'),
  ('OZON_STORAGE', 6, 'MONEY'),
  ('PACKAGING', 7, 'MONEY'),
  ('REFUND_LOSS', 8, 'RATE'),
  ('SALE_PRICE', 9, 'MONEY'),
  ('TAX', 10, 'RATE')
)
INSERT INTO candidate_economics_evidence (
  id, "organizationId", "workspaceId", "workspaceScopeKey",
  "researchRunId", "candidateId", "schemaVersion", kind, "valueKind",
  amount, rate, "minimumAmount", currency, provider, "adapterVersion",
  "requestId", "verificationMethod", "verificationStatus", binding,
  "bindingHash", "normalizedEvidence", "rawSnapshotSha256", "rawSnapshotRef",
  "contentHash", "dedupeKey", "observedAt", "fetchedAt", "verifiedAt",
  "validUntil"
)
SELECT
  'proof-evidence-' || ordinal, :'org_id', :'workspace_id',
  'workspace:id:' || :'workspace_id', :'run_id', :'candidate_id',
  'candidate-economics-evidence/v1', role, value_kind,
  CASE WHEN value_kind = 'MONEY'
    THEN CASE WHEN role = 'SALE_PRICE' THEN 2000 ELSE 10 END END,
  CASE WHEN value_kind IN ('RATE', 'RATE_WITH_MINIMUM') THEN 0.05 END,
  CASE WHEN value_kind = 'RATE_WITH_MINIMUM' THEN 1 END,
  CASE WHEN value_kind IN ('MONEY', 'RATE_WITH_MINIMUM') THEN 'RUB' END,
  'semantic-test', 'v1', 'request-' || ordinal, 'SIGNED_SOURCE', 'VERIFIED',
  jsonb_build_object('candidateFingerprint', :'candidate_fp'),
  repeat(md5('binding-' || role), 2), jsonb_build_object('role', role),
  repeat(md5('raw-' || role), 2),
  'economics-evidence/' || :'org_id' || '/raw/' ||
    repeat(md5('raw-' || role), 2),
  repeat(md5('content-' || role), 2), repeat(md5('dedupe-' || role), 2),
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP + INTERVAL '2 hours'
FROM roles;

INSERT INTO candidate_economics_evaluations (
  id, "organizationId", "workspaceId", "workspaceScopeKey",
  "researchRunId", "candidateId", "supplierQuoteEvidenceId", "schemaVersion",
  "policyVersion", "calculatorVersion", "policySnapshot", "policyHash",
  "inputSetHash", "rawSnapshotSetHash", "contentHash", "dedupeKey", status,
  decision, currency, "salePrice", "grossProfitBeforeAds",
  "grossMarginBeforeAds", "netProfitAfterAds", "netMarginAfterAds",
  "totalCost", "componentBreakdown", "hardGateReasons", "validFrom",
  "validUntil"
) VALUES (
  'proof-eval', :'org_id', :'workspace_id',
  'workspace:id:' || :'workspace_id', :'run_id', :'candidate_id',
  'proof-quote', 'candidate-economics-evaluation/v1',
  'candidate-economics-policy/v1', 'candidate-economics-calculator/v1',
  '{"dispatchFreshnessBufferSeconds":900,"maxEvidenceAgeSeconds":86400}',
  repeat('d', 64), repeat('e', 64), repeat('f', 64), repeat('1', 64),
  repeat('2', 64), 'VERIFIED', 'PASS', 'RUB', 2000, 1200, 0.6, 900,
  0.45, 1100, '{"procurement":{"amount":"400.0000"}}', '{}',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '2 hours'
);

INSERT INTO candidate_economics_evaluation_inputs (
  id, "organizationId", "workspaceId", "workspaceScopeKey",
  "researchRunId", "candidateId", "evaluationId", "economicsEvidenceId",
  role, ordinal, "evidenceContentHash", "rawSnapshotSha256"
)
SELECT
  'proof-input-' || evidence.ordinal, evidence."organizationId",
  evidence."workspaceId", evidence."workspaceScopeKey",
  evidence."researchRunId", evidence."candidateId", 'proof-eval', evidence.id,
  evidence.kind, evidence.ordinal, evidence."contentHash",
  evidence."rawSnapshotSha256"
FROM (
  SELECT row.*, row_number() OVER (ORDER BY kind) - 1 AS ordinal
  FROM candidate_economics_evidence AS row
  WHERE row."candidateId" = :'candidate_id'
    AND row.id LIKE 'proof-evidence-%'
) AS evidence;

INSERT INTO product_risk_records (
  id, "organizationId", "workspaceId", "researchRunId", "candidateId",
  "riskType", severity, "ruleVersion", evidence, source, "reviewStatus",
  "createdAt", "updatedAt"
) VALUES (
  'proof-risk', :'org_id', :'workspace_id', :'run_id', :'candidate_id',
  'RISK_CLEARANCE_ATTESTED', 'LOW', 'semantic-risk/v1',
  jsonb_build_object(
    'schemaVersion', 'risk-clearance-evidence/v1',
    'subjectVersion', 'listing-risk-subject/v1',
    'evidenceHash', repeat('9', 64),
    'attestation', jsonb_build_object(
      'provider', 'semantic-test', 'ruleset', 'semantic-risk/v1',
      'evidenceRef', 'semantic/1',
      'fetchedAt', to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'expiresAt', to_char((CURRENT_TIMESTAMP + INTERVAL '1 hour')
        AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'subjectHash', 'sha256:' || repeat('6', 64), 'passed', true,
      'signature', 'hmac-sha256:' || repeat('7', 64)
    )
  ),
  'semantic-test', 'AUTO', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO product_launches (
  id, "organizationId", "reviewTaskId", "reportId", "candidateId",
  "candidateIndex", status, "imageGenerationApproved", "confirmAutoPublish",
  "requestedBy", execution, "createdAt", "updatedAt", "researchCandidateId",
  "economicsEvaluationId", "economicsEvaluationHash"
) VALUES (
  'proof-launch', :'org_id', :'review_id', :'run_id', :'candidate_id', 0,
  'QUEUED', false, false, 'semantic-test', '{}', CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP, :'candidate_id', 'proof-eval', repeat('1', 64)
);

-- A second syntactically PASS evaluation deliberately has no input rows. The
-- hardening trigger must reject any snapshot that tries to consume it.
INSERT INTO candidate_economics_evaluations (
  id, "organizationId", "workspaceId", "workspaceScopeKey",
  "researchRunId", "candidateId", "supplierQuoteEvidenceId", "schemaVersion",
  "policyVersion", "calculatorVersion", "policySnapshot", "policyHash",
  "inputSetHash", "rawSnapshotSetHash", "contentHash", "dedupeKey", status,
  decision, currency, "salePrice", "grossProfitBeforeAds",
  "grossMarginBeforeAds", "netProfitAfterAds", "netMarginAfterAds",
  "totalCost", "componentBreakdown", "hardGateReasons", "validFrom",
  "validUntil"
) VALUES (
  'proof-eval-empty', :'org_id', :'workspace_id',
  'workspace:id:' || :'workspace_id', :'run_id', :'candidate_id',
  'proof-quote', 'candidate-economics-evaluation/v1',
  'candidate-economics-policy/v1', 'candidate-economics-calculator/v1',
  '{"dispatchFreshnessBufferSeconds":900,"maxEvidenceAgeSeconds":86400}',
  repeat('3', 64), repeat('5', 64), repeat('6', 64), repeat('7', 64),
  repeat('8', 64), 'VERIFIED', 'PASS', 'RUB', 2000, 1200, 0.6, 900,
  0.45, 1100, '{"procurement":{"amount":"400.0000"}}', '{}',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '2 hours'
);

INSERT INTO product_launches (
  id, "organizationId", "reviewTaskId", "reportId", "candidateId",
  "candidateIndex", status, "imageGenerationApproved", "confirmAutoPublish",
  "requestedBy", execution, "createdAt", "updatedAt", "researchCandidateId",
  "economicsEvaluationId", "economicsEvaluationHash"
) VALUES (
  'proof-launch-empty', :'org_id', :'review_id', :'run_id',
  'semantic-empty-candidate', 1,
  'QUEUED', false, false, 'semantic-test', '{}', CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP, :'candidate_id', 'proof-eval-empty', repeat('7', 64)
);

DO $expected_missing_inputs$
BEGIN
  BEGIN
    INSERT INTO listing_publish_snapshots (
      id, "organizationId", "productLaunchId", "listingDraftId",
      "reviewTaskId", "productId", "channelId", target, "schemaVersion",
      "listingApprovalHash", "economicsEvaluationId",
      "economicsEvaluationHash", "economicsInputSetHash",
      "economicsValidUntil", snapshot, "snapshotHash", status, "approvedBy",
      "approvedAt", result, "createdAt", "updatedAt"
    ) SELECT
      'proof-snapshot-empty', evaluation."organizationId",
      'proof-launch-empty', 'listing-proof', launch."reviewTaskId",
      'product-proof', 'channel-proof', 'OZON',
      'listing-publish-snapshot/v3', repeat('a', 64), 'proof-eval-empty',
      repeat('7', 64), repeat('5', 64), evaluation."validUntil", '{}',
      repeat('b', 64), 'APPROVED', 'semantic-test', CURRENT_TIMESTAMP, '{}',
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM candidate_economics_evaluations AS evaluation
    JOIN product_launches AS launch ON launch.id = 'proof-launch-empty'
    WHERE evaluation.id = 'proof-eval-empty';
    RAISE EXCEPTION 'missing-input proof unexpectedly passed';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    RAISE NOTICE 'missing-input proof rejected as expected';
  END;
END
$expected_missing_inputs$;

INSERT INTO listing_publish_snapshots (
  id, "organizationId", "productLaunchId", "listingDraftId", "reviewTaskId",
  "productId", "channelId", target, "schemaVersion", "listingApprovalHash",
  "economicsEvaluationId", "economicsEvaluationHash", "economicsInputSetHash",
  "economicsValidUntil", snapshot, "snapshotHash", status, "approvedBy",
  "approvedAt", result, "createdAt", "updatedAt"
)
SELECT
  'proof-snapshot', :'org_id', 'proof-launch', 'listing-proof', :'review_id',
  'product-proof', 'channel-proof', 'OZON', 'listing-publish-snapshot/v3',
  repeat('a', 64), 'proof-eval', repeat('1', 64), repeat('e', 64),
  evaluation."validUntil",
  jsonb_build_object(
    'schemaVersion', 'listing-publish-snapshot/v3',
    'canonicalProduct', jsonb_build_object(
      'identity', jsonb_build_object('title', 'Semantic listing'),
      'media', jsonb_build_object('images', jsonb_build_array(
        'https://assets.example.com/semantic.png'))
    ),
    'economics', jsonb_build_object(
      'evaluationId', 'proof-eval', 'contentHash', repeat('1', 64),
      'inputSetHash', repeat('e', 64),
      'validUntil', to_char(
        evaluation."validUntil", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'status', 'VERIFIED', 'decision', 'PASS', 'source',
      'candidate_economics_evaluations', 'currency', 'RUB', 'price',
      '2000.0000'
    ),
    'payload', jsonb_build_object('price', 2000),
    'safetyEvidence', jsonb_build_object(
      'risk', jsonb_build_object(
        'source', 'product_risk_records', 'clearanceRecordId', 'proof-risk',
        'evidenceHash', repeat('9', 64), 'fetchedAt', to_char(
          CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ),
        'listing', jsonb_build_object(
          'schemaVersion', 'listing-final-risk-clearance/v1',
          'subjectVersion', 'listing-risk-subject/v1',
          'subjectHash', 'sha256:' || repeat('a', 64),
          'evidenceHash', repeat('b', 64),
          'provider', 'semantic-test',
          'ruleset', 'semantic-listing-risk/v1',
          'fetchedAt', to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'expiresAt', to_char((CURRENT_TIMESTAMP + INTERVAL '1 hour')
            AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'subject', jsonb_build_object(
            'title', 'Semantic listing', 'description', 'Semantic description',
            'tags', '[]'::jsonb, 'platform', 'ozon',
            'scopeId', 'listing:' || :'org_id' || ':listing-proof',
            'bullets', jsonb_build_array('Semantic benefit'),
            'keywords', jsonb_build_array('semantic'),
            'attributes', '{}'::jsonb,
            'imageHashes', jsonb_build_array('sha256:' || repeat('c', 64))
          ),
          'clearanceEvidence', jsonb_build_object(
            'schemaVersion', 'risk-clearance-evidence/v1',
            'subjectVersion', 'listing-risk-subject/v1',
            'evidenceHash', repeat('b', 64),
            'attestation', jsonb_build_object(
              'provider', 'semantic-test',
              'ruleset', 'semantic-listing-risk/v1',
              'evidenceRef', 'semantic/listing/1',
              'fetchedAt', to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
                'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
              'expiresAt', to_char((CURRENT_TIMESTAMP + INTERVAL '1 hour')
                AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
              'subjectHash', 'sha256:' || repeat('a', 64),
              'passed', true,
              'signature', 'hmac-sha256:' || repeat('d', 64)
            )
          ),
          'screening', jsonb_build_object(
            'decision', 'PASS', 'screeningStatus', 'CLEARED',
            'evidenceStatus', 'ATTESTED', 'publishable', true,
            'hardGateReasons', '[]'::jsonb,
            'mcpManifestHash', repeat('e', 64),
            'mcpExecutableHash', repeat('f', 64)
          )
        )
      )
    )
  ),
  repeat('4', 64), 'APPROVED', 'semantic-test', CURRENT_TIMESTAMP, '{}',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM candidate_economics_evaluations AS evaluation
WHERE evaluation.id = 'proof-eval';

-- A syntactically VERIFIED/PASS evaluation with an object policy but no
-- freshness members must never authorize a publish snapshot.
INSERT INTO candidate_economics_evaluations (
  id, "organizationId", "workspaceId", "workspaceScopeKey",
  "researchRunId", "candidateId", "supplierQuoteEvidenceId", "schemaVersion",
  "policyVersion", "calculatorVersion", "policySnapshot", "policyHash",
  "inputSetHash", "rawSnapshotSetHash", "contentHash", "dedupeKey", status,
  decision, currency, "salePrice", "grossProfitBeforeAds",
  "grossMarginBeforeAds", "netProfitAfterAds", "netMarginAfterAds",
  "totalCost", "componentBreakdown", "hardGateReasons", "validFrom",
  "validUntil"
)
SELECT
  'proof-eval-null-policy', "organizationId", "workspaceId",
  "workspaceScopeKey", "researchRunId", "candidateId",
  "supplierQuoteEvidenceId", "schemaVersion", "policyVersion",
  "calculatorVersion", '{}'::jsonb, repeat('0', 64), repeat('3', 64),
  repeat('4', 64), repeat('5', 64), repeat('6', 64), status, decision,
  currency, "salePrice", "grossProfitBeforeAds", "grossMarginBeforeAds",
  "netProfitAfterAds", "netMarginAfterAds", "totalCost",
  "componentBreakdown", "hardGateReasons", "validFrom", "validUntil"
FROM candidate_economics_evaluations
WHERE id = 'proof-eval';

INSERT INTO candidate_economics_evaluation_inputs (
  id, "organizationId", "workspaceId", "workspaceScopeKey",
  "researchRunId", "candidateId", "evaluationId", "economicsEvidenceId",
  role, ordinal, "evidenceContentHash", "rawSnapshotSha256"
)
SELECT
  'proof-null-policy-input-' || ordinal, "organizationId", "workspaceId",
  "workspaceScopeKey", "researchRunId", "candidateId",
  'proof-eval-null-policy', "economicsEvidenceId", role, ordinal,
  "evidenceContentHash", "rawSnapshotSha256"
FROM candidate_economics_evaluation_inputs
WHERE "evaluationId" = 'proof-eval';

INSERT INTO product_launches (
  id, "organizationId", "reviewTaskId", "reportId", "candidateId",
  "candidateIndex", status, "imageGenerationApproved", "confirmAutoPublish",
  "requestedBy", execution, "createdAt", "updatedAt", "researchCandidateId",
  "economicsEvaluationId", "economicsEvaluationHash"
)
SELECT
  'proof-launch-null-policy', "organizationId", "reviewTaskId", "reportId",
  'semantic-null-policy-candidate', 900001, status,
  "imageGenerationApproved", "confirmAutoPublish", "requestedBy", execution,
  "createdAt", "updatedAt", "researchCandidateId",
  'proof-eval-null-policy', repeat('5', 64)
FROM product_launches
WHERE id = 'proof-launch';

DO $expected_null_policy_rejection$
BEGIN
  BEGIN
    INSERT INTO listing_publish_snapshots (
      id, "organizationId", "productLaunchId", "listingDraftId",
      "reviewTaskId", "productId", "channelId", target, "schemaVersion",
      "listingApprovalHash", "economicsEvaluationId",
      "economicsEvaluationHash", "economicsInputSetHash",
      "economicsValidUntil", snapshot, "snapshotHash", status, "approvedBy",
      "approvedAt", result, "createdAt", "updatedAt"
    )
    SELECT
      'proof-snapshot-null-policy', snapshot."organizationId",
      'proof-launch-null-policy', snapshot."listingDraftId",
      snapshot."reviewTaskId", snapshot."productId", snapshot."channelId",
      snapshot.target, snapshot."schemaVersion", snapshot."listingApprovalHash",
      'proof-eval-null-policy', repeat('5', 64), repeat('3', 64),
      evaluation."validUntil",
      jsonb_set(
        jsonb_set(
          jsonb_set(
            snapshot.snapshot,
            '{economics,evaluationId}',
            to_jsonb('proof-eval-null-policy'::text)
          ),
          '{economics,contentHash}',
          to_jsonb(repeat('5', 64))
        ),
        '{economics,inputSetHash}',
        to_jsonb(repeat('3', 64))
      ),
      repeat('0', 64), snapshot.status, snapshot."approvedBy",
      snapshot."approvedAt", snapshot.result, snapshot."createdAt",
      snapshot."updatedAt"
    FROM listing_publish_snapshots AS snapshot
    JOIN candidate_economics_evaluations AS evaluation
      ON evaluation.id = 'proof-eval-null-policy'
    WHERE snapshot.id = 'proof-snapshot';
    RAISE EXCEPTION 'missing economics freshness policy unexpectedly passed';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    RAISE NOTICE 'missing economics freshness policy rejected as expected';
  END;
END
$expected_null_policy_rejection$;

-- Reuse the valid candidate clearance with only expiresAt removed. Before the
-- forward hardening, NULL timestamp comparisons made this shape fail open.
INSERT INTO product_risk_records (
  id, "organizationId", "workspaceId", "researchRunId", "candidateId",
  "riskType", severity, "ruleVersion", evidence, source, "reviewStatus",
  "createdAt", "updatedAt"
)
SELECT
  'proof-risk-no-expiry', "organizationId", "workspaceId", "researchRunId",
  "candidateId", "riskType", severity, "ruleVersion",
  evidence #- '{attestation,expiresAt}', source, "reviewStatus",
  "createdAt", "updatedAt"
FROM product_risk_records
WHERE id = 'proof-risk';

DO $expected_candidate_expiry_rejection$
BEGIN
  BEGIN
    INSERT INTO listing_publish_snapshots (
      id, "organizationId", "productLaunchId", "listingDraftId",
      "reviewTaskId", "productId", "channelId", target, "schemaVersion",
      "listingApprovalHash", "economicsEvaluationId",
      "economicsEvaluationHash", "economicsInputSetHash",
      "economicsValidUntil", snapshot, "snapshotHash", status, "approvedBy",
      "approvedAt", result, "createdAt", "updatedAt"
    )
    SELECT
      'proof-snapshot-candidate-no-expiry', "organizationId",
      "productLaunchId", "listingDraftId", "reviewTaskId", "productId",
      "channelId", target, "schemaVersion", "listingApprovalHash",
      "economicsEvaluationId", "economicsEvaluationHash",
      "economicsInputSetHash", "economicsValidUntil",
      jsonb_set(
        snapshot,
        '{safetyEvidence,risk,clearanceRecordId}',
        to_jsonb('proof-risk-no-expiry'::text)
      ),
      repeat('3', 64), status, "approvedBy", "approvedAt", result,
      "createdAt", "updatedAt"
    FROM listing_publish_snapshots
    WHERE id = 'proof-snapshot';
    RAISE EXCEPTION 'missing candidate risk expiry unexpectedly passed';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    RAISE NOTICE 'missing candidate risk expiry rejected as expected';
  END;
END
$expected_candidate_expiry_rejection$;

DO $expected_listing_expiry_rejection$
BEGIN
  BEGIN
    INSERT INTO listing_publish_snapshots (
      id, "organizationId", "productLaunchId", "listingDraftId",
      "reviewTaskId", "productId", "channelId", target, "schemaVersion",
      "listingApprovalHash", "economicsEvaluationId",
      "economicsEvaluationHash", "economicsInputSetHash",
      "economicsValidUntil", snapshot, "snapshotHash", status, "approvedBy",
      "approvedAt", result, "createdAt", "updatedAt"
    )
    SELECT
      'proof-snapshot-listing-no-expiry', "organizationId",
      "productLaunchId", "listingDraftId", "reviewTaskId", "productId",
      "channelId", target, "schemaVersion", "listingApprovalHash",
      "economicsEvaluationId", "economicsEvaluationHash",
      "economicsInputSetHash", "economicsValidUntil",
      jsonb_set(
        jsonb_set(
          snapshot,
          '{safetyEvidence,risk,listing,expiresAt}',
          'null'::jsonb
        ),
        '{safetyEvidence,risk,listing,clearanceEvidence,attestation,expiresAt}',
        'null'::jsonb
      ),
      repeat('5', 64), status, "approvedBy", "approvedAt", result,
      "createdAt", "updatedAt"
    FROM listing_publish_snapshots
    WHERE id = 'proof-snapshot';
    RAISE EXCEPTION 'NULL final listing expiry unexpectedly passed';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    RAISE NOTICE 'NULL final listing expiry rejected as expected';
  END;
END
$expected_listing_expiry_rejection$;

DO $expected_partial_screening_rejection$
BEGIN
  BEGIN
    INSERT INTO listing_publish_snapshots (
      id, "organizationId", "productLaunchId", "listingDraftId",
      "reviewTaskId", "productId", "channelId", target, "schemaVersion",
      "listingApprovalHash", "economicsEvaluationId",
      "economicsEvaluationHash", "economicsInputSetHash",
      "economicsValidUntil", snapshot, "snapshotHash", status, "approvedBy",
      "approvedAt", result, "createdAt", "updatedAt"
    )
    SELECT
      'proof-snapshot-partial-screening', "organizationId",
      "productLaunchId", "listingDraftId", "reviewTaskId", "productId",
      "channelId", target, "schemaVersion", "listingApprovalHash",
      "economicsEvaluationId", "economicsEvaluationHash",
      "economicsInputSetHash", "economicsValidUntil",
      jsonb_set(
        snapshot,
        '{safetyEvidence,risk,listing,screening}',
        jsonb_build_object(
          'mcpManifestHash', repeat('e', 64),
          'mcpExecutableHash', repeat('f', 64)
        )
      ),
      repeat('6', 64), status, "approvedBy", "approvedAt", result,
      "createdAt", "updatedAt"
    FROM listing_publish_snapshots
    WHERE id = 'proof-snapshot';
    RAISE EXCEPTION 'partial final listing screening unexpectedly passed';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    RAISE NOTICE 'partial final listing screening rejected as expected';
  END;
END
$expected_partial_screening_rejection$;

INSERT INTO product_risk_records (
  id, "organizationId", "workspaceId", "researchRunId", "candidateId",
  "riskType", severity, "ruleVersion", evidence, source, "reviewStatus",
  "createdAt", "updatedAt"
) VALUES (
  'proof-risk-summary', :'org_id', :'workspace_id', :'run_id', :'candidate_id',
  'RISK_CLEARANCE_ATTESTED', 'LOW', 'semantic-risk/v1',
  '{"summary":"Risk clearance attested by caller-controlled text"}',
  'semantic-test', 'AUTO', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

DO $expected_summary_rejection$
BEGIN
  BEGIN
    INSERT INTO listing_publish_snapshots (
      id, "organizationId", "productLaunchId", "listingDraftId",
      "reviewTaskId", "productId", "channelId", target, "schemaVersion",
      "listingApprovalHash", "economicsEvaluationId",
      "economicsEvaluationHash", "economicsInputSetHash",
      "economicsValidUntil", snapshot, "snapshotHash", status, "approvedBy",
      "approvedAt", result, "createdAt", "updatedAt"
    )
    SELECT
      'proof-snapshot-summary', "organizationId", "productLaunchId",
      "listingDraftId", "reviewTaskId", "productId", "channelId", target,
      "schemaVersion", "listingApprovalHash", "economicsEvaluationId",
      "economicsEvaluationHash", "economicsInputSetHash",
      "economicsValidUntil",
      jsonb_set(snapshot,
        '{safetyEvidence,risk,clearanceRecordId}',
        '"proof-risk-summary"'::jsonb),
      repeat('1', 64), status, "approvedBy", "approvedAt", result,
      "createdAt", "updatedAt"
    FROM listing_publish_snapshots WHERE id = 'proof-snapshot';
    RAISE EXCEPTION 'summary-only risk clearance unexpectedly passed';
  EXCEPTION WHEN SQLSTATE '23514' OR SQLSTATE '23503' THEN
    RAISE NOTICE 'summary-only risk clearance rejected as expected';
  END;
END
$expected_summary_rejection$;

DO $expected_final_listing_risk_rejection$
BEGIN
  BEGIN
    INSERT INTO listing_publish_snapshots (
      id, "organizationId", "productLaunchId", "listingDraftId",
      "reviewTaskId", "productId", "channelId", target, "schemaVersion",
      "listingApprovalHash", "economicsEvaluationId",
      "economicsEvaluationHash", "economicsInputSetHash",
      "economicsValidUntil", snapshot, "snapshotHash", status, "approvedBy",
      "approvedAt", result, "createdAt", "updatedAt"
    )
    SELECT
      'proof-snapshot-no-final-risk', "organizationId", "productLaunchId",
      "listingDraftId", "reviewTaskId", "productId", "channelId", target,
      "schemaVersion", "listingApprovalHash", "economicsEvaluationId",
      "economicsEvaluationHash", "economicsInputSetHash",
      "economicsValidUntil",
      snapshot #- '{safetyEvidence,risk,listing}', repeat('2', 64), status,
      "approvedBy", "approvedAt", result, "createdAt", "updatedAt"
    FROM listing_publish_snapshots WHERE id = 'proof-snapshot';
    RAISE EXCEPTION 'missing final listing risk clearance unexpectedly passed';
  EXCEPTION WHEN SQLSTATE '23514' OR SQLSTATE '23503' THEN
    RAISE NOTICE 'missing final listing risk clearance rejected as expected';
  END;
END
$expected_final_listing_risk_rejection$;

DO $expected_risk_immutability$
BEGIN
  BEGIN
    DELETE FROM product_risk_records WHERE id = 'proof-risk';
    RAISE EXCEPTION 'signed risk clearance delete unexpectedly passed';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    RAISE NOTICE 'signed risk clearance delete rejected as expected';
  END;
END
$expected_risk_immutability$;

INSERT INTO external_submissions (
  id, "organizationId", "productLaunchId", "publishSnapshotId", provider,
  operation, "idempotencyKey", "requestHash", "payloadHash",
  "economicsEvaluationId", "economicsEvaluationHash", status, "attemptCount",
  request, result, "reconciliationResult", "createdAt", "updatedAt"
) VALUES (
  'proof-submission', :'org_id', 'proof-launch', 'proof-snapshot', 'OZON',
  'PRODUCT_PUBLISH', 'proof-idempotency', repeat('4', 64), repeat('8', 64),
  'proof-eval', repeat('1', 64), 'PREPARED', 0,
  jsonb_build_object(
    'schemaVersion', 'external-submission/v3',
    'publishSnapshotId', 'proof-snapshot', 'snapshotHash', repeat('4', 64),
    'payloadHash', repeat('8', 64), 'economicsEvaluationId', 'proof-eval',
    'economicsEvaluationHash', repeat('1', 64)
  ), '{}', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

UPDATE external_submissions
SET status = 'CLAIMED', "claimToken" = 'claim-proof',
  "claimedAt" = CURRENT_TIMESTAMP, "attemptCount" = 1
WHERE id = 'proof-submission';

UPDATE external_submissions
SET status = 'REQUEST_SENT', "requestSentAt" = CURRENT_TIMESTAMP
WHERE id = 'proof-submission';

UPDATE external_submissions
SET status = 'SUCCEEDED', "resolvedAt" = CURRENT_TIMESTAMP,
  result = '{"status":"ACTIVE_ON_OZON"}'
WHERE id = 'proof-submission';

DO $expected_delete_guard$
BEGIN
  BEGIN
    DELETE FROM listing_publish_snapshots WHERE id = 'proof-snapshot';
    RAISE EXCEPTION 'snapshot delete unexpectedly passed';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    RAISE NOTICE 'snapshot delete rejected as expected';
  END;
END
$expected_delete_guard$;

SELECT
  'PASS' AS semantic_verification,
  (SELECT count(*) FROM candidate_economics_evaluation_inputs
   WHERE "evaluationId" = 'proof-eval') AS input_count,
  (SELECT count(*) FROM listing_publish_snapshots
   WHERE id = 'proof-snapshot-empty') AS invalid_snapshot_count,
  (SELECT status::TEXT FROM external_submissions
   WHERE id = 'proof-submission') AS submission_status;

ROLLBACK;

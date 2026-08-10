ALTER TABLE "listing_drafts"
ADD COLUMN "evaluationResult" JSONB NOT NULL DEFAULT '{}';

UPDATE "listing_drafts"
SET "evaluationResult" = jsonb_build_object(
  'evaluatorVersion', 'listing-evaluator/v1',
  'outcome', 'UNVERIFIED',
  'score', NULL,
  'evaluatedAt', CURRENT_TIMESTAMP,
  'checks', '[]'::jsonb,
  'blockingIssues', jsonb_build_array('LEGACY_EVALUATION_MISSING'),
  'reviewReasons', jsonb_build_array('REEVALUATION_REQUIRED'),
  'approval', NULL
);

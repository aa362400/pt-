ALTER TABLE "listing_drafts"
ADD COLUMN "schemaVersion" TEXT NOT NULL DEFAULT 'listing-bundle/v1',
ADD COLUMN "bundle" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "validationResult" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "provenance" JSONB NOT NULL DEFAULT '{}';

UPDATE "listing_drafts"
SET
  "bundle" = jsonb_build_object(
    'schemaVersion', 'listing-bundle/v1',
    'platform', "platform",
    'content', jsonb_build_object(
      'title', "title",
      'description', "description",
      'bullets', to_jsonb("bullets")
    ),
    'seo', jsonb_build_object(
      'keywords', to_jsonb("seoTags"),
      'searchTerms', '[]'::jsonb
    ),
    'attributes', "attributes",
    'commercial', '{}'::jsonb,
    'personalization', jsonb_build_object('enabled', false, 'fields', '[]'::jsonb),
    'mediaMapping', '[]'::jsonb,
    'policy', jsonb_build_object(
      'reviewRequired', true,
      'claims', '[]'::jsonb,
      'warnings', jsonb_build_array('Legacy draft requires validation before publication.')
    ),
    'provenance', jsonb_build_object(
      'source', 'legacy-migration',
      'migratedAt', CURRENT_TIMESTAMP
    )
  ),
  "validationResult" = jsonb_build_object(
    'status', 'UNVERIFIED',
    'schemaVersion', 'listing-bundle/v1',
    'checkedAt', CURRENT_TIMESTAMP,
    'issues', jsonb_build_array(jsonb_build_object(
      'code', 'LEGACY_DRAFT_UNVERIFIED',
      'path', '',
      'message', 'Legacy draft must pass validation before publication.'
    ))
  ),
  "provenance" = jsonb_build_object(
    'source', 'legacy-migration',
    'migratedAt', CURRENT_TIMESTAMP
  );

ALTER TABLE "listing_drafts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "listing_drafts" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "listing_drafts_organization_isolation" ON "listing_drafts";
CREATE POLICY "listing_drafts_organization_isolation" ON "listing_drafts" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

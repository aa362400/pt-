ALTER TABLE "file_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "file_assets" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "file_assets_organization_isolation" ON "file_assets";
CREATE POLICY "file_assets_organization_isolation" ON "file_assets" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

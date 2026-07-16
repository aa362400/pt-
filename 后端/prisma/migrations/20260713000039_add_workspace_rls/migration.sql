ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspaces" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspaces_organization_isolation" ON "workspaces";
CREATE POLICY "workspaces_organization_isolation" ON "workspaces" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

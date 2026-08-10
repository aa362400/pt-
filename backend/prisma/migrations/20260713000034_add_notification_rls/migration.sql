ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_organization_isolation" ON "notifications";
CREATE POLICY "notifications_organization_isolation" ON "notifications" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

ALTER TABLE "automation_flows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "automation_flows" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "automation_flows_organization_isolation" ON "automation_flows";
CREATE POLICY "automation_flows_organization_isolation" ON "automation_flows" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

ALTER TABLE "team_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "team_tasks" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_tasks_organization_isolation" ON "team_tasks";
CREATE POLICY "team_tasks_organization_isolation" ON "team_tasks" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

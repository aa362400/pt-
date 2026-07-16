ALTER TABLE "review_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "review_tasks" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "review_tasks_organization_isolation" ON "review_tasks";
CREATE POLICY "review_tasks_organization_isolation" ON "review_tasks" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

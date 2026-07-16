ALTER TABLE "image_prompt_projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "image_prompt_projects" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "image_prompt_projects_organization_isolation" ON "image_prompt_projects";
CREATE POLICY "image_prompt_projects_organization_isolation" ON "image_prompt_projects" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

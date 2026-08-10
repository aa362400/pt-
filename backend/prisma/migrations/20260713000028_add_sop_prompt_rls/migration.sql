ALTER TABLE "sops" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sops" FORCE ROW LEVEL SECURITY;
ALTER TABLE "prompt_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prompt_templates" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sops_organization_isolation" ON "sops";
CREATE POLICY "sops_organization_isolation" ON "sops" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

DROP POLICY IF EXISTS "prompt_templates_organization_isolation" ON "prompt_templates";
CREATE POLICY "prompt_templates_organization_isolation" ON "prompt_templates" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

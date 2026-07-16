ALTER TABLE "product_research_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_research_reports" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_research_reports_organization_isolation" ON "product_research_reports";
CREATE POLICY "product_research_reports_organization_isolation" ON "product_research_reports" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

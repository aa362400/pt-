ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices_organization_isolation" ON "invoices";
CREATE POLICY "invoices_organization_isolation" ON "invoices" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

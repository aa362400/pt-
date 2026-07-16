ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
ALTER TABLE "audit_chain_heads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_chain_heads" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_organization_isolation" ON "audit_logs";
CREATE POLICY "audit_logs_organization_isolation" ON "audit_logs" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

DROP POLICY IF EXISTS "audit_chain_heads_organization_isolation" ON "audit_chain_heads";
CREATE POLICY "audit_chain_heads_organization_isolation" ON "audit_chain_heads" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

ALTER TABLE "assistant_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assistant_sessions" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assistant_sessions_organization_isolation" ON "assistant_sessions";
CREATE POLICY "assistant_sessions_organization_isolation" ON "assistant_sessions" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

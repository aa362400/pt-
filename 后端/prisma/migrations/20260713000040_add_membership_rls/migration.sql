ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "memberships_organization_isolation" ON "memberships";
CREATE POLICY "memberships_organization_isolation" ON "memberships" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

DROP POLICY IF EXISTS "memberships_login_bootstrap" ON "memberships";
CREATE POLICY "memberships_login_bootstrap" ON "memberships" FOR SELECT
USING ("userId" = NULLIF(current_setting('app.current_user_id', true), ''));

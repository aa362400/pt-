ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "suppliers" FORCE ROW LEVEL SECURITY;
ALTER TABLE "supply_skus" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supply_skus" FORCE ROW LEVEL SECURITY;
ALTER TABLE "replenishment_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "replenishment_plans" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "suppliers_organization_isolation" ON "suppliers";
CREATE POLICY "suppliers_organization_isolation" ON "suppliers" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

DROP POLICY IF EXISTS "supply_skus_organization_isolation" ON "supply_skus";
CREATE POLICY "supply_skus_organization_isolation" ON "supply_skus" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

DROP POLICY IF EXISTS "replenishment_plans_organization_isolation" ON "replenishment_plans";
CREATE POLICY "replenishment_plans_organization_isolation" ON "replenishment_plans" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));

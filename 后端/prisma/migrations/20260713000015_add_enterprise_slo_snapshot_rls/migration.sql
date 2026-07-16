ALTER TABLE "enterprise_slo_daily_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "enterprise_slo_daily_snapshots" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "enterprise_slo_daily_snapshots_organization_isolation"
  ON "enterprise_slo_daily_snapshots";

CREATE POLICY "enterprise_slo_daily_snapshots_organization_isolation"
  ON "enterprise_slo_daily_snapshots"
  FOR ALL
  USING (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  )
  WITH CHECK (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  );

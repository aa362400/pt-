ALTER TABLE "agent_autonomy_daily_metrics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_autonomy_daily_metrics" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_autonomy_daily_metrics_organization_isolation"
  ON "agent_autonomy_daily_metrics";

CREATE POLICY "agent_autonomy_daily_metrics_organization_isolation"
  ON "agent_autonomy_daily_metrics"
  FOR ALL
  USING (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  )
  WITH CHECK (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  );

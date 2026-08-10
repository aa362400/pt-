ALTER TABLE "trend_insights" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trend_insights" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trend_insights_organization_isolation"
  ON "trend_insights";

CREATE POLICY "trend_insights_organization_isolation"
  ON "trend_insights"
  FOR ALL
  USING (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  )
  WITH CHECK (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  );

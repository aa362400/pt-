ALTER TABLE "alerts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "alerts" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alerts_organization_isolation" ON "alerts";

CREATE POLICY "alerts_organization_isolation"
  ON "alerts"
  FOR ALL
  USING (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  )
  WITH CHECK (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  );

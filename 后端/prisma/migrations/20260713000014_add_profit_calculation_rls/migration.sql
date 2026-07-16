ALTER TABLE "profit_calculations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "profit_calculations" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profit_calculations_organization_isolation"
  ON "profit_calculations";

CREATE POLICY "profit_calculations_organization_isolation"
  ON "profit_calculations"
  FOR ALL
  USING (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  )
  WITH CHECK (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  );

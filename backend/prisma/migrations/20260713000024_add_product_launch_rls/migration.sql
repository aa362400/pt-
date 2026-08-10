ALTER TABLE "product_launches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_launches" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_launches_organization_isolation"
  ON "product_launches";

CREATE POLICY "product_launches_organization_isolation"
  ON "product_launches"
  FOR ALL
  USING (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  )
  WITH CHECK (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  );

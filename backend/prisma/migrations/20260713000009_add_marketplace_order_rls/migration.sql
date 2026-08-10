ALTER TABLE "marketplace_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "marketplace_orders" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "marketplace_orders_organization_isolation"
  ON "marketplace_orders";

CREATE POLICY "marketplace_orders_organization_isolation"
  ON "marketplace_orders"
  FOR ALL
  USING (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  )
  WITH CHECK (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  );

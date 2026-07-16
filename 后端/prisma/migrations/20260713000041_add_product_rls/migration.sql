ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_organization_isolation" ON "products";
CREATE POLICY "products_organization_isolation" ON "products" FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM "workspaces"
     WHERE "workspaces".id = "products"."workspaceId"
       AND "workspaces"."organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM "workspaces"
     WHERE "workspaces".id = "products"."workspaceId"
       AND "workspaces"."organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')
  )
);

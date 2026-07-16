ALTER TABLE "channel_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "channel_connections" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "channel_connections_organization_isolation"
  ON "channel_connections";

CREATE POLICY "channel_connections_organization_isolation"
  ON "channel_connections"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
        FROM "workspaces"
       WHERE "workspaces"."id" = "channel_connections"."workspaceId"
         AND "workspaces"."organizationId" =
           NULLIF(current_setting('app.current_organization_id', true), '')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM "workspaces"
       WHERE "workspaces"."id" = "channel_connections"."workspaceId"
         AND "workspaces"."organizationId" =
           NULLIF(current_setting('app.current_organization_id', true), '')
    )
  );

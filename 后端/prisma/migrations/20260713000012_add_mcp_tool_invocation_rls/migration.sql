ALTER TABLE "mcp_tool_invocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mcp_tool_invocations" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mcp_tool_invocations_organization_isolation"
  ON "mcp_tool_invocations";

CREATE POLICY "mcp_tool_invocations_organization_isolation"
  ON "mcp_tool_invocations"
  FOR ALL
  USING (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  )
  WITH CHECK (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  );

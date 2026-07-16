ALTER TABLE "agent_capability_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_capability_tokens" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_capability_tokens_organization_isolation"
  ON "agent_capability_tokens";

CREATE POLICY "agent_capability_tokens_organization_isolation"
  ON "agent_capability_tokens"
  FOR ALL
  USING (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  )
  WITH CHECK (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  );

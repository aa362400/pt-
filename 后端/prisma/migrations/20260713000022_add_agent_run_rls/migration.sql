ALTER TABLE "agent_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_runs" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_runs_organization_isolation"
  ON "agent_runs";

CREATE POLICY "agent_runs_organization_isolation"
  ON "agent_runs"
  FOR ALL
  USING (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  )
  WITH CHECK (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  );

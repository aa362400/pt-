-- Tenant-owned child tables must not rely on their parent table's RLS alone.
-- Direct access to a child table bypasses the parent's policy unless the child
-- has its own policy that resolves ownership through the foreign key.

ALTER TABLE "assistant_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assistant_messages" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "assistant_messages_organization_isolation" ON "assistant_messages";
CREATE POLICY "assistant_messages_organization_isolation"
ON "assistant_messages"
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM "assistant_sessions" AS parent
    WHERE parent."id" = "assistant_messages"."sessionId"
      AND parent."organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "assistant_sessions" AS parent
    WHERE parent."id" = "assistant_messages"."sessionId"
      AND parent."organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')
  )
);

ALTER TABLE "automation_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "automation_runs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "automation_runs_organization_isolation" ON "automation_runs";
CREATE POLICY "automation_runs_organization_isolation"
ON "automation_runs"
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM "automation_flows" AS parent
    WHERE parent."id" = "automation_runs"."flowId"
      AND parent."organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "automation_flows" AS parent
    WHERE parent."id" = "automation_runs"."flowId"
      AND parent."organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')
  )
);

ALTER TABLE "store_metric_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_metric_snapshots" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "store_metric_snapshots_organization_isolation" ON "store_metric_snapshots";
CREATE POLICY "store_metric_snapshots_organization_isolation"
ON "store_metric_snapshots"
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM "workspaces" AS parent
    WHERE parent."id" = "store_metric_snapshots"."workspaceId"
      AND parent."organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "workspaces" AS parent
    WHERE parent."id" = "store_metric_snapshots"."workspaceId"
      AND parent."organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')
  )
);

ALTER TABLE "store_agent_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_agent_profiles" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "store_agent_profiles_organization_isolation" ON "store_agent_profiles";
CREATE POLICY "store_agent_profiles_organization_isolation"
ON "store_agent_profiles"
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM "workspaces" AS parent
    WHERE parent."id" = "store_agent_profiles"."workspaceId"
      AND parent."organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "workspaces" AS parent
    WHERE parent."id" = "store_agent_profiles"."workspaceId"
      AND parent."organizationId" = NULLIF(current_setting('app.current_organization_id', true), '')
  )
);

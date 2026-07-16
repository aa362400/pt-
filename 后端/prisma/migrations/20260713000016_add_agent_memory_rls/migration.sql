ALTER TABLE "agent_work_memories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_work_memories" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_work_memories_organization_isolation"
  ON "agent_work_memories";

CREATE POLICY "agent_work_memories_organization_isolation"
  ON "agent_work_memories"
  FOR ALL
  USING (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  )
  WITH CHECK (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  );

ALTER TABLE "agent_experience_cards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_experience_cards" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_experience_cards_organization_isolation"
  ON "agent_experience_cards";

CREATE POLICY "agent_experience_cards_organization_isolation"
  ON "agent_experience_cards"
  FOR ALL
  USING (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  )
  WITH CHECK (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  );

ALTER TABLE "product_research_candidate_decisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_research_candidate_decisions" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_research_candidate_decisions_organization_isolation"
  ON "product_research_candidate_decisions";

CREATE POLICY "product_research_candidate_decisions_organization_isolation"
  ON "product_research_candidate_decisions"
  FOR ALL
  USING (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  )
  WITH CHECK (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  );

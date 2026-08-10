ALTER TABLE "keyword_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "keyword_reports" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "keyword_reports_organization_isolation"
  ON "keyword_reports";

CREATE POLICY "keyword_reports_organization_isolation"
  ON "keyword_reports"
  FOR ALL
  USING (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  )
  WITH CHECK (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  );

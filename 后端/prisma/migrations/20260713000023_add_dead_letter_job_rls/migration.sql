ALTER TABLE "dead_letter_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dead_letter_jobs" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dead_letter_jobs_organization_isolation"
  ON "dead_letter_jobs";

CREATE POLICY "dead_letter_jobs_organization_isolation"
  ON "dead_letter_jobs"
  FOR ALL
  USING (
    "organizationId" IS NOT NULL
    AND "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  )
  WITH CHECK (
    "organizationId" IS NOT NULL
    AND "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  );

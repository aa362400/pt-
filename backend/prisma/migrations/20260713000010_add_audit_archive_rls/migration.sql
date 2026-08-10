ALTER TABLE "audit_archives" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_archives" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_archives_organization_isolation"
  ON "audit_archives";

CREATE POLICY "audit_archives_organization_isolation"
  ON "audit_archives"
  FOR ALL
  USING (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  )
  WITH CHECK (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  );

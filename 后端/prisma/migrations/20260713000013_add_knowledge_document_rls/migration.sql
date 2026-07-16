ALTER TABLE "knowledge_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "knowledge_documents" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "knowledge_documents_organization_isolation"
  ON "knowledge_documents";

CREATE POLICY "knowledge_documents_organization_isolation"
  ON "knowledge_documents"
  FOR ALL
  USING (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  )
  WITH CHECK (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  );

ALTER TABLE "outbox_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outbox_events" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "outbox_events_organization_isolation"
  ON "outbox_events";

CREATE POLICY "outbox_events_organization_isolation"
  ON "outbox_events"
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

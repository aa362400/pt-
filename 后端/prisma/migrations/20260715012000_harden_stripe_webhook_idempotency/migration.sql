CREATE UNIQUE INDEX "invoices_stripeInvoiceId_key"
  ON "invoices"("stripeInvoiceId");

CREATE TABLE "stripe_webhook_events" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'STRIPE',
  "providerEventId" TEXT NOT NULL,
  "livemode" BOOLEAN NOT NULL,
  "eventType" TEXT NOT NULL,
  "objectId" TEXT,
  "resolvedOrganizationId" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stripe_webhook_events_provider_livemode_providerEventId_key"
  ON "stripe_webhook_events"("provider", "livemode", "providerEventId");
CREATE INDEX "stripe_webhook_events_eventType_createdAt_idx"
  ON "stripe_webhook_events"("eventType", "createdAt");
CREATE INDEX "stripe_webhook_events_resolvedOrganizationId_createdAt_idx"
  ON "stripe_webhook_events"("resolvedOrganizationId", "createdAt");
CREATE INDEX "stripe_webhook_events_processedAt_idx"
  ON "stripe_webhook_events"("processedAt");
